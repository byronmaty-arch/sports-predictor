/**
 * Data fetching layer
 * Sources: football-data.org (stats) + the-odds-api.com (odds) + web scraping fallback
 */

const fetch = require('node-fetch');
const { FOOTBALL_DATA_API_KEY, ODDS_API_KEY } = require('./config');

const FD_BASE = 'https://api.football-data.org/v4';
const ODDS_BASE = 'https://api.the-odds-api.com/v4';

// ─── Football-Data.org ────────────────────────────────────────────────────────

async function fdGet(path) {
  if (!FOOTBALL_DATA_API_KEY) return null;
  const res = await fetch(`${FD_BASE}${path}`, {
    headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY },
  });
  if (!res.ok) return null;
  return res.json();
}

// Search for a team by name across all competitions
async function searchTeam(name) {
  const data = await fdGet(`/teams?name=${encodeURIComponent(name)}&limit=5`);
  if (!data || !data.teams) return null;
  return data.teams[0] || null;
}

// Get recent matches for a team (last N)
async function getTeamMatches(teamId, limit = 10) {
  const data = await fdGet(`/teams/${teamId}/matches?status=FINISHED&limit=${limit}`);
  if (!data || !data.matches) return [];
  return data.matches;
}

// Get upcoming match between two teams
async function getUpcomingMatch(teamId) {
  const data = await fdGet(`/teams/${teamId}/matches?status=SCHEDULED&limit=5`);
  if (!data || !data.matches) return [];
  return data.matches;
}

// ─── The Odds API ─────────────────────────────────────────────────────────────

async function getOdds(homeTeam, awayTeam) {
  if (!ODDS_API_KEY) return null;
  try {
    // Get all upcoming soccer odds
    const res = await fetch(
      `${ODDS_BASE}/sports/soccer/odds?apiKey=${ODDS_API_KEY}&regions=uk,eu&markets=h2h&oddsFormat=decimal`
    );
    if (!res.ok) return null;
    const events = await res.json();

    // Find the matching event
    const home = homeTeam.toLowerCase();
    const away = awayTeam.toLowerCase();
    const match = events.find(e =>
      e.home_team.toLowerCase().includes(home.split(' ')[0]) &&
      e.away_team.toLowerCase().includes(away.split(' ')[0])
    );
    if (!match) return null;

    // Average odds across bookmakers
    const avgOdds = { home: [], draw: [], away: [] };
    for (const bookie of match.bookmakers) {
      const h2h = bookie.markets.find(m => m.key === 'h2h');
      if (!h2h) continue;
      for (const outcome of h2h.outcomes) {
        if (outcome.name === match.home_team) avgOdds.home.push(outcome.price);
        else if (outcome.name === 'Draw') avgOdds.draw.push(outcome.price);
        else avgOdds.away.push(outcome.price);
      }
    }

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return {
      home: avg(avgOdds.home),
      draw: avg(avgOdds.draw),
      away: avg(avgOdds.away),
      bookmakerCount: match.bookmakers.length,
    };
  } catch {
    return null;
  }
}

// ─── Web scrape fallback (no API key needed) ──────────────────────────────────

// Scrape basic form from transfermarkt or similar public site
async function scrapeTeamForm(teamName) {
  try {
    // Use a simple search to get form data
    const query = encodeURIComponent(`${teamName} last 5 matches results 2024 2025`);
    const res = await fetch(`https://www.google.com/search?q=${query}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    // We parse the snippet — very basic
    const html = await res.text();
    // Extract result snippets (W/D/L pattern)
    const results = [];
    const patterns = html.matchAll(/(\d+)[\s-]+(\d+)/g);
    for (const m of patterns) {
      if (results.length >= 5) break;
      results.push({ score: `${m[1]}-${m[2]}` });
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Stats computation ────────────────────────────────────────────────────────

function computeTeamStats(matches, teamId) {
  if (!matches.length) return null;

  let goalsScored = 0, goalsConceded = 0, wins = 0, draws = 0, losses = 0;
  const form = [];

  for (const m of matches) {
    const isHome = m.homeTeam.id === teamId;
    const scored = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;

    if (scored === null || conceded === null) continue;

    goalsScored += scored;
    goalsConceded += conceded;

    if (scored > conceded) { wins++; form.push('W'); }
    else if (scored === conceded) { draws++; form.push('D'); }
    else { losses++; form.push('L'); }
  }

  const played = wins + draws + losses;
  return {
    played,
    wins, draws, losses,
    goalsScored,
    goalsConceded,
    avgScored: goalsScored / played,
    avgConceded: goalsConceded / played,
    form: form.slice(0, 5).join(''),
    points: wins * 3 + draws,
  };
}

module.exports = { searchTeam, getTeamMatches, getUpcomingMatch, getOdds, computeTeamStats };
