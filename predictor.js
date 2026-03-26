/**
 * Core prediction engine
 * Combines data fetching + Poisson model + value analysis
 */

const { searchTeam, getTeamMatches, getOdds, computeTeamStats, getTeamXG, getH2H, computeH2HStats } = require('./fetcher');
const { predictMatch, findValue } = require('./poisson');
const { computeInjuryFactor } = require('./injuries');

// Average goals per match across top European leagues (used as baseline)
const LEAGUE_AVG_GOALS = 1.35; // per team per match (roughly 2.7 total)

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

  const homeStats = computeTeamStats(homeMatches, homeTeamData.id, homeXG);
  const awayStats = computeTeamStats(awayMatches, awayTeamData.id, awayXG);

  if (!homeStats || !awayStats) {
    return { error: 'Not enough match data to make a prediction.' };
  }

  // 3. Use home-specific stats for home team, away-specific for away team
  const homeInjuryFactor = computeInjuryFactor(homeInjuries);
  const awayInjuryFactor = computeInjuryFactor(awayInjuries);

  // Apply injury multipliers to xG — missing players = fewer goals / weaker defence
  const homeAttack  = (homeStats.homeAvgScored   / LEAGUE_AVG_GOALS) * (homeInjuryFactor?.attackMultiplier  ?? 1);
  const homeDefence = (homeStats.homeAvgConceded  / LEAGUE_AVG_GOALS) * (homeInjuryFactor?.defenceMultiplier ?? 1);
  const awayAttack  = (awayStats.awayAvgScored   / LEAGUE_AVG_GOALS) * (awayInjuryFactor?.attackMultiplier  ?? 1);
  const awayDefence = (awayStats.awayAvgConceded  / LEAGUE_AVG_GOALS) * (awayInjuryFactor?.defenceMultiplier ?? 1);

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

  return {
    homeTeam: homeTeamData.name,
    awayTeam: awayTeamData.name,
    homeStats,
    awayStats,
    h2h,
    prediction,
    odds,
    valueAnalysis,
    homeInjuryFactor,
    awayInjuryFactor,
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
