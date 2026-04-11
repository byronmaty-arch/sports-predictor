/**
 * Core prediction engine
 * Combines data fetching + Poisson model + value analysis
 */

const { searchTeam, getTeamMatches, getOdds, computeTeamStats, getTeamXG, getH2H, computeH2HStats, getDaysSinceLastMatch, computeRestFactor } = require('./fetcher');
const { predictMatch, findValue } = require('./poisson');
const { computeInjuryFactor } = require('./injuries');
const { calculateElo, eloStrengthMultiplier, eloLabel } = require('./elo');

// League-specific average goals per team per match (measured 2025-26 season)
// Using per-league values prevents Bundesliga teams (1.60/game) from being
// inflated vs the old single 1.35 average that was calibrated for PL/La Liga
const LEAGUE_AVG_GOALS_MAP = {
  'PL':  1.37,  // Premier League
  'BL1': 1.60,  // Bundesliga
  'SA':  1.22,  // Serie A
  'PD':  1.34,  // La Liga
  'FL1': 1.40,  // Ligue 1
};
const LEAGUE_AVG_GOALS_DEFAULT = 1.35; // fallback for other leagues

async function analyzMatch(homeTeamName, awayTeamName, options = {}) {
  const { homeInjuries = [], awayInjuries = [] } = options;
  // 1. Find teams
  const [homeTeamData, awayTeamData] = await Promise.all([
    searchTeam(homeTeamName),
    searchTeam(awayTeamName),
  ]);

  if (!homeTeamData || !awayTeamData) {
    return { error: 'Could not find one or both teams. Try using full team names.' };
  }

  // 2. Fetch matches, xG and H2H all in parallel
  const [homeMatches, awayMatches, homeXG, awayXG, h2hMatches] = await Promise.all([
    getTeamMatches(homeTeamData.id, 10),
    getTeamMatches(awayTeamData.id, 10),
    getTeamXG(homeTeamData.name),
    getTeamXG(awayTeamData.name),
    getH2H(homeTeamData.id, awayTeamData.id),
  ]);

  // Detect league from recent matches for calibrated league average
  const leagueCode = homeMatches[0]?.competition?.code || 'PL';
  const LEAGUE_AVG_GOALS = LEAGUE_AVG_GOALS_MAP[leagueCode] || LEAGUE_AVG_GOALS_DEFAULT;

  const homeStats = computeTeamStats(homeMatches, homeTeamData.id, homeXG);
  const awayStats = computeTeamStats(awayMatches, awayTeamData.id, awayXG);

  if (!homeStats || !awayStats) {
    return { error: 'Not enough match data to make a prediction.' };
  }

  // 3. Elo ratings — calculated from seed + recent match history
  const homeElo = calculateElo(homeTeamData.id, homeMatches);
  const awayElo = calculateElo(awayTeamData.id, awayMatches);
  const homeEloMult = eloStrengthMultiplier(homeElo, awayElo);  // >1 if home stronger
  const awayEloMult = eloStrengthMultiplier(awayElo, homeElo);  // >1 if away stronger

  // 4. Rest days — fatigue/rust multiplier from days since last match
  const homeDaysRest = getDaysSinceLastMatch(homeMatches);
  const awayDaysRest = getDaysSinceLastMatch(awayMatches);
  const homeRestFactor = computeRestFactor(homeDaysRest);
  const awayRestFactor = computeRestFactor(awayDaysRest);

  // 5. Injury factors
  const homeInjuryFactor = computeInjuryFactor(homeInjuries);
  const awayInjuryFactor = computeInjuryFactor(awayInjuries);

  // 6. Compose all multipliers into final attack/defence strengths
  //    Order: base xG → Elo adjustment → rest factor → injury factor
  // Cap raw avg values before dividing by league avg to prevent extreme lambdas
  // when a team has an outlier run (e.g. leaking 3+ goals/game away in small sample)
  // Cap at leagueAvg × 1.5 — prevents extreme outlier runs from compounding
  const MAX_AVG_GOALS = LEAGUE_AVG_GOALS * 1.5;
  const capAvg = v => Math.min(v, MAX_AVG_GOALS);

  const homeAttack  = (capAvg(homeStats.homeAvgScored)  / LEAGUE_AVG_GOALS)
    * homeEloMult
    * homeRestFactor
    * (homeInjuryFactor?.attackMultiplier  ?? 1);

  const homeDefence = (capAvg(homeStats.homeAvgConceded) / LEAGUE_AVG_GOALS)
    * (1 / homeEloMult)
    * homeRestFactor
    * (homeInjuryFactor?.defenceMultiplier ?? 1);

  const awayAttack  = (capAvg(awayStats.awayAvgScored)  / LEAGUE_AVG_GOALS)
    * awayEloMult
    * awayRestFactor
    * (awayInjuryFactor?.attackMultiplier  ?? 1);

  const awayDefence = (capAvg(awayStats.awayAvgConceded) / LEAGUE_AVG_GOALS)
    * (1 / awayEloMult)
    * awayRestFactor
    * (awayInjuryFactor?.defenceMultiplier ?? 1);

  // 4. Run Poisson model with regression to mean
  const confidence = (homeStats.confidence + awayStats.confidence) / 2;
  const prediction = predictMatch(
    { attackStrength: homeAttack, defenceWeakness: homeDefence },
    { attackStrength: awayAttack, defenceWeakness: awayDefence },
    LEAGUE_AVG_GOALS,
    confidence
  );

  // 5. Apply H2H adjustment (15% weight if we have ≥3 meetings)
  const h2h = computeH2HStats(h2hMatches, homeTeamData.id);
  if (h2h && h2h.matches >= 3) {
    const H2H_WEIGHT = 0.15;
    const p = prediction.probabilities;
    const blended = {
      homeWin: p.homeWin * (1 - H2H_WEIGHT) + h2h.homeWinRate * H2H_WEIGHT,
      draw:    p.draw    * (1 - H2H_WEIGHT) + h2h.drawRate    * H2H_WEIGHT,
      awayWin: p.awayWin * (1 - H2H_WEIGHT) + h2h.awayWinRate * H2H_WEIGHT,
    };
    // Re-normalise
    const total = blended.homeWin + blended.draw + blended.awayWin;
    prediction.probabilities = {
      homeWin: blended.homeWin / total,
      draw:    blended.draw    / total,
      awayWin: blended.awayWin / total,
    };
  }

  // 6. Get bookmaker odds
  const odds = await getOdds(homeTeamName, awayTeamName);

  // 7. Value analysis
  let valueAnalysis = null;
  if (odds) {
    const homeValue = findValue(prediction.probabilities.homeWin, odds.home);
    const drawValue = findValue(prediction.probabilities.draw, odds.draw);
    const awayValue = findValue(prediction.probabilities.awayWin, odds.away);
    valueAnalysis = { homeValue, drawValue, awayValue };
  }

  // Draw risk: home win is in the borderline 55–70% range AND draw is competitive (≥20%)
  // These matches statistically end in draws more often than the model expects
  const p = prediction.probabilities;
  const drawRisk = p.homeWin >= 0.55 && p.homeWin < 0.70 && p.draw >= 0.20;

  return {
    homeTeam: homeTeamData.name,
    awayTeam: awayTeamData.name,
    homeStats,
    awayStats,
    h2h,
    prediction,
    drawRisk,
    odds,
    valueAnalysis,
    homeInjuryFactor,
    awayInjuryFactor,
    elo: {
      home: homeElo, homeTier: eloLabel(homeElo),
      away: awayElo, awayTier: eloLabel(awayElo),
    },
    rest: {
      homeDays: homeDaysRest, homeRestFactor,
      awayDays: awayDaysRest, awayRestFactor,
    },
  };
}

// Simpler prediction using manual stats input (fallback when no API key)
function quickPredict(homeGoalsAvg, awayGoalsAvg, homeConcededAvg, awayConcededAvg) {
  const leagueAvg = LEAGUE_AVG_GOALS;
  const homeAttack = homeGoalsAvg / leagueAvg;
  const homeDefence = homeConcededAvg / leagueAvg;
  const awayAttack = awayGoalsAvg / leagueAvg;
  const awayDefence = awayConcededAvg / leagueAvg;

  return predictMatch(
    { attackStrength: homeAttack, defenceWeakness: homeDefence },
    { attackStrength: awayAttack, defenceWeakness: awayDefence },
    leagueAvg
  );
}

module.exports = { analyzMatch, quickPredict };
