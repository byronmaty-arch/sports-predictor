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

// ─── Hardcoded team map (football-data.org IDs) ───────────────────────────────
// Free tier search is unreliable — this guarantees fast, accurate lookups
const TEAM_MAP = {
  // Premier League
  'arsenal': { id: 57, name: 'Arsenal FC' },
  'chelsea': { id: 61, name: 'Chelsea FC' },
  'liverpool': { id: 64, name: 'Liverpool FC' },
  'manchester city': { id: 65, name: 'Manchester City FC' },
  'man city': { id: 65, name: 'Manchester City FC' },
  'manchester united': { id: 66, name: 'Manchester United FC' },
  'man united': { id: 66, name: 'Manchester United FC' },
  'man utd': { id: 66, name: 'Manchester United FC' },
  'tottenham': { id: 73, name: 'Tottenham Hotspur FC' },
  'spurs': { id: 73, name: 'Tottenham Hotspur FC' },
  'aston villa': { id: 58, name: 'Aston Villa FC' },
  'newcastle': { id: 67, name: 'Newcastle United FC' },
  'west ham': { id: 563, name: 'West Ham United FC' },
  'brighton': { id: 397, name: 'Brighton & Hove Albion FC' },
  'wolves': { id: 76, name: 'Wolverhampton Wanderers FC' },
  'wolverhampton': { id: 76, name: 'Wolverhampton Wanderers FC' },
  'crystal palace': { id: 354, name: 'Crystal Palace FC' },
  'brentford': { id: 402, name: 'Brentford FC' },
  'fulham': { id: 63, name: 'Fulham FC' },
  'everton': { id: 62, name: 'Everton FC' },
  'nottingham forest': { id: 351, name: 'Nottingham Forest FC' },
  'forest': { id: 351, name: 'Nottingham Forest FC' },
  'bournemouth': { id: 1044, name: 'AFC Bournemouth' },
  'leicester': { id: 338, name: 'Leicester City FC' },
  'ipswich': { id: 349, name: 'Ipswich Town FC' },
  'southampton': { id: 340, name: 'Southampton FC' },
  // Bundesliga
  'bayern': { id: 5, name: 'FC Bayern München' },
  'bayern munich': { id: 5, name: 'FC Bayern München' },
  'dortmund': { id: 4, name: 'Borussia Dortmund' },
  'borussia dortmund': { id: 4, name: 'Borussia Dortmund' },
  'rb leipzig': { id: 721, name: 'RB Leipzig' },
  'leipzig': { id: 721, name: 'RB Leipzig' },
  'leverkusen': { id: 3, name: 'Bayer 04 Leverkusen' },
  'bayer leverkusen': { id: 3, name: 'Bayer 04 Leverkusen' },
  'frankfurt': { id: 19, name: 'Eintracht Frankfurt' },
  'eintracht frankfurt': { id: 19, name: 'Eintracht Frankfurt' },
  // La Liga
  'real madrid': { id: 86, name: 'Real Madrid CF' },
  'barcelona': { id: 81, name: 'FC Barcelona' },
  'atletico madrid': { id: 78, name: 'Club Atlético de Madrid' },
  'atletico': { id: 78, name: 'Club Atlético de Madrid' },
  'sevilla': { id: 559, name: 'Sevilla FC' },
  'real sociedad': { id: 92, name: 'Real Sociedad de Fútbol' },
  'villarreal': { id: 94, name: 'Villarreal CF' },
  'athletic bilbao': { id: 77, name: 'Athletic Club' },
  'athletic club': { id: 77, name: 'Athletic Club' },
  'real betis': { id: 90, name: 'Real Betis Balompié' },
  // Serie A
  'juventus': { id: 109, name: 'Juventus FC' },
  'inter milan': { id: 108, name: 'FC Internazionale Milano' },
  'inter': { id: 108, name: 'FC Internazionale Milano' },
  'internazionale': { id: 108, name: 'FC Internazionale Milano' },
  'ac milan': { id: 98, name: 'AC Milan' },
  'milan': { id: 98, name: 'AC Milan' },
  'napoli': { id: 113, name: 'SSC Napoli' },
  'roma': { id: 100, name: 'AS Roma' },
  'as roma': { id: 100, name: 'AS Roma' },
  'lazio': { id: 110, name: 'SS Lazio' },
  'atalanta': { id: 102, name: 'Atalanta BC' },
  'fiorentina': { id: 99, name: 'ACF Fiorentina' },
  // Ligue 1
  'psg': { id: 524, name: 'Paris Saint-Germain FC' },
  'paris saint-germain': { id: 524, name: 'Paris Saint-Germain FC' },
  'paris sg': { id: 524, name: 'Paris Saint-Germain FC' },
  'marseille': { id: 516, name: 'Olympique de Marseille' },
  'lyon': { id: 523, name: 'Olympique Lyonnais' },
  'monaco': { id: 548, name: 'AS Monaco FC' },
  'lille': { id: 521, name: 'LOSC Lille' },
  // Others
  'ajax': { id: 678, name: 'AFC Ajax' },
  'porto': { id: 503, name: 'FC Porto' },
  'benfica': { id: 498, name: 'SL Benfica' },
  'celtic': { id: 264, name: 'Celtic FC' },
  'rangers': { id: 258, name: 'Rangers FC' },
};

// Search for a team by name — checks hardcoded map first, then API
async function searchTeam(name) {
  const nameLower = name.toLowerCase().trim();

  // 1. Direct map lookup (instant, reliable)
  if (TEAM_MAP[nameLower]) {
    return TEAM_MAP[nameLower];
  }

  // 2. Partial map match (e.g. "Man City" inside "manchester city")
  for (const [key, team] of Object.entries(TEAM_MAP)) {
    if (key.includes(nameLower) || nameLower.includes(key)) {
      return team;
    }
  }

  // 3. API fallback for unlisted teams
  const data = await fdGet(`/teams?search=${encodeURIComponent(name)}&limit=10`);
  if (data && data.teams && data.teams.length > 0) {
    const match = data.teams.find(t => {
      const teamName = (t.name || '').toLowerCase();
      const shortName = (t.shortName || '').toLowerCase();
      return teamName.includes(nameLower) || shortName.includes(nameLower);
    });
    if (match) return match;
  }

  return null;
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
