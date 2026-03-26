/**
 * Core prediction engine
 * Combines data fetching + Poisson model + value analysis
 */

const { searchTeam, getTeamMatches, getOdds, computeTeamStats } = require('./fetcher');
const { predictMatch, findValue } = require('./poisson');

// Average goals per match across top European leagues (used as baseline)
const LEAGUE_AVG_GOALS = 1.35; // per team per match (roughly 2.7 total)

async function analyzMatch(homeTeamName, awayTeamName) {
  // 1. Find teams
  const [homeTeamData, awayTeamData] = await Promise.all([
    searchTeam(homeTeamName),
    searchTeam(awayTeamName),
  ]);

  if (!homeTeamData || !awayTeamData) {
    return { error: 'Could not find one or both teams. Try using full team names.' };
  }

  // 2. Get recent matches
  const [homeMatches, awayMatches] = await Promise.all([
    getTeamMatches(homeTeamData.id, 10),
    getTeamMatches(awayTeamData.id, 10),
  ]);

  const homeStats = computeTeamStats(homeMatches, homeTeamData.id);
  const awayStats = computeTeamStats(awayMatches, awayTeamData.id);

  if (!homeStats || !awayStats) {
    return { error: 'Not enough match data to make a prediction.' };
  }

  // 3. Compute attack/defence strengths relative to league average
  const homeAttack = homeStats.avgScored / LEAGUE_AVG_GOALS;
  const homeDefence = homeStats.avgConceded / LEAGUE_AVG_GOALS;
  const awayAttack = awayStats.avgScored / LEAGUE_AVG_GOALS;
  const awayDefence = awayStats.avgConceded / LEAGUE_AVG_GOALS;

  // 4. Run Poisson model
  const prediction = predictMatch(
    { attackStrength: homeAttack, defenceWeakness: homeDefence },
    { attackStrength: awayAttack, defenceWeakness: awayDefence },
    LEAGUE_AVG_GOALS
  );

  // 5. Get bookmaker odds
  const odds = await getOdds(homeTeamName, awayTeamName);

  // 6. Value analysis
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
    prediction,
    odds,
    valueAnalysis,
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
