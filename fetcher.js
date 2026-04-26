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
  // Premier League (2025-26)
  'arsenal': { id: 57, name: 'Arsenal FC' },
  'aston villa': { id: 58, name: 'Aston Villa FC' },
  'chelsea': { id: 61, name: 'Chelsea FC' },
  'everton': { id: 62, name: 'Everton FC' },
  'fulham': { id: 63, name: 'Fulham FC' },
  'liverpool': { id: 64, name: 'Liverpool FC' },
  'manchester city': { id: 65, name: 'Manchester City FC' },
  'man city': { id: 65, name: 'Manchester City FC' },
  'manchester united': { id: 66, name: 'Manchester United FC' },
  'man united': { id: 66, name: 'Manchester United FC' },
  'man utd': { id: 66, name: 'Manchester United FC' },
  'newcastle': { id: 67, name: 'Newcastle United FC' },
  'newcastle united': { id: 67, name: 'Newcastle United FC' },
  'sunderland': { id: 71, name: 'Sunderland AFC' },
  'tottenham': { id: 73, name: 'Tottenham Hotspur FC' },
  'spurs': { id: 73, name: 'Tottenham Hotspur FC' },
  'wolves': { id: 76, name: 'Wolverhampton Wanderers FC' },
  'wolverhampton': { id: 76, name: 'Wolverhampton Wanderers FC' },
  'burnley': { id: 328, name: 'Burnley FC' },
  'leeds': { id: 341, name: 'Leeds United FC' },
  'leeds united': { id: 341, name: 'Leeds United FC' },
  'nottingham forest': { id: 351, name: 'Nottingham Forest FC' },
  'forest': { id: 351, name: 'Nottingham Forest FC' },
  'crystal palace': { id: 354, name: 'Crystal Palace FC' },
  'brighton': { id: 397, name: 'Brighton & Hove Albion FC' },
  'brentford': { id: 402, name: 'Brentford FC' },
  'west ham': { id: 563, name: 'West Ham United FC' },
  'bournemouth': { id: 1044, name: 'AFC Bournemouth' },
  // Bundesliga (2025-26)
  'koln': { id: 1, name: '1. FC Köln' },
  'köln': { id: 1, name: '1. FC Köln' },
  '1. fc koln': { id: 1, name: '1. FC Köln' },
  'hoffenheim': { id: 2, name: 'TSG 1899 Hoffenheim' },
  'tsg hoffenheim': { id: 2, name: 'TSG 1899 Hoffenheim' },
  'leverkusen': { id: 3, name: 'Bayer 04 Leverkusen' },
  'bayer leverkusen': { id: 3, name: 'Bayer 04 Leverkusen' },
  'dortmund': { id: 4, name: 'Borussia Dortmund' },
  'borussia dortmund': { id: 4, name: 'Borussia Dortmund' },
  'bayern': { id: 5, name: 'FC Bayern München' },
  'bayern munich': { id: 5, name: 'FC Bayern München' },
  'hamburger sv': { id: 7, name: 'Hamburger SV' },
  'hsv': { id: 7, name: 'Hamburger SV' },
  'stuttgart': { id: 10, name: 'VfB Stuttgart' },
  'vfb stuttgart': { id: 10, name: 'VfB Stuttgart' },
  'wolfsburg': { id: 11, name: 'VfL Wolfsburg' },
  'vfl wolfsburg': { id: 11, name: 'VfL Wolfsburg' },
  'werder bremen': { id: 12, name: 'SV Werder Bremen' },
  'bremen': { id: 12, name: 'SV Werder Bremen' },
  'mainz': { id: 15, name: '1. FSV Mainz 05' },
  'mainz 05': { id: 15, name: '1. FSV Mainz 05' },
  'augsburg': { id: 16, name: 'FC Augsburg' },
  'freiburg': { id: 17, name: 'SC Freiburg' },
  'sc freiburg': { id: 17, name: 'SC Freiburg' },
  'gladbach': { id: 18, name: 'Borussia Mönchengladbach' },
  'm\'gladbach': { id: 18, name: 'Borussia Mönchengladbach' },
  'monchengladbach': { id: 18, name: 'Borussia Mönchengladbach' },
  'borussia monchengladbach': { id: 18, name: 'Borussia Mönchengladbach' },
  'frankfurt': { id: 19, name: 'Eintracht Frankfurt' },
  'eintracht frankfurt': { id: 19, name: 'Eintracht Frankfurt' },
  'st. pauli': { id: 20, name: 'FC St. Pauli 1910' },
  'st pauli': { id: 20, name: 'FC St. Pauli 1910' },
  'union berlin': { id: 28, name: '1. FC Union Berlin' },
  'heidenheim': { id: 44, name: '1. FC Heidenheim 1846' },
  'rb leipzig': { id: 721, name: 'RB Leipzig' },
  'leipzig': { id: 721, name: 'RB Leipzig' },
  // La Liga (2025-26)
  'athletic bilbao': { id: 77, name: 'Athletic Club' },
  'athletic club': { id: 77, name: 'Athletic Club' },
  'atletico madrid': { id: 78, name: 'Club Atlético de Madrid' },
  'atletico': { id: 78, name: 'Club Atlético de Madrid' },
  'osasuna': { id: 79, name: 'CA Osasuna' },
  'espanyol': { id: 80, name: 'RCD Espanyol de Barcelona' },
  'rcd espanyol': { id: 80, name: 'RCD Espanyol de Barcelona' },
  'barcelona': { id: 81, name: 'FC Barcelona' },
  'getafe': { id: 82, name: 'Getafe CF' },
  'real madrid': { id: 86, name: 'Real Madrid CF' },
  'rayo vallecano': { id: 87, name: 'Rayo Vallecano de Madrid' },
  'rayo': { id: 87, name: 'Rayo Vallecano de Madrid' },
  'levante': { id: 88, name: 'Levante UD' },
  'mallorca': { id: 89, name: 'RCD Mallorca' },
  'real betis': { id: 90, name: 'Real Betis Balompié' },
  'real sociedad': { id: 92, name: 'Real Sociedad de Fútbol' },
  'villarreal': { id: 94, name: 'Villarreal CF' },
  'valencia': { id: 95, name: 'Valencia CF' },
  'alaves': { id: 263, name: 'Deportivo Alavés' },
  'deportivo alaves': { id: 263, name: 'Deportivo Alavés' },
  'elche': { id: 285, name: 'Elche CF' },
  'girona': { id: 298, name: 'Girona FC' },
  'celta vigo': { id: 558, name: 'RC Celta de Vigo' },
  'celta': { id: 558, name: 'RC Celta de Vigo' },
  'sevilla': { id: 559, name: 'Sevilla FC' },
  'real oviedo': { id: 1048, name: 'Real Oviedo' },
  'oviedo': { id: 1048, name: 'Real Oviedo' },
  // Serie A (2025-26)
  'ac milan': { id: 98, name: 'AC Milan' },
  'milan': { id: 98, name: 'AC Milan' },
  'fiorentina': { id: 99, name: 'ACF Fiorentina' },
  'as roma': { id: 100, name: 'AS Roma' },
  'roma': { id: 100, name: 'AS Roma' },
  'atalanta': { id: 102, name: 'Atalanta BC' },
  'bologna': { id: 103, name: 'Bologna FC 1909' },
  'cagliari': { id: 104, name: 'Cagliari Calcio' },
  'genoa': { id: 107, name: 'Genoa CFC' },
  'inter milan': { id: 108, name: 'FC Internazionale Milano' },
  'inter': { id: 108, name: 'FC Internazionale Milano' },
  'internazionale': { id: 108, name: 'FC Internazionale Milano' },
  'juventus': { id: 109, name: 'Juventus FC' },
  'lazio': { id: 110, name: 'SS Lazio' },
  'parma': { id: 112, name: 'Parma Calcio 1913' },
  'napoli': { id: 113, name: 'SSC Napoli' },
  'udinese': { id: 115, name: 'Udinese Calcio' },
  'verona': { id: 450, name: 'Hellas Verona FC' },
  'hellas verona': { id: 450, name: 'Hellas Verona FC' },
  'torino': { id: 586, name: 'Torino FC' },
  'lecce': { id: 5890, name: 'US Lecce' },
  'como': { id: 7397, name: 'Como 1907' },
  // Ligue 1 (2025-26)
  'toulouse': { id: 511, name: 'Toulouse FC' },
  'brest': { id: 512, name: 'Stade Brestois 29' },
  'stade brestois': { id: 512, name: 'Stade Brestois 29' },
  'marseille': { id: 516, name: 'Olympique de Marseille' },
  'auxerre': { id: 519, name: 'AJ Auxerre' },
  'lille': { id: 521, name: 'Lille OSC' },
  'nice': { id: 522, name: 'OGC Nice' },
  'ogc nice': { id: 522, name: 'OGC Nice' },
  'lyon': { id: 523, name: 'Olympique Lyonnais' },
  'psg': { id: 524, name: 'Paris Saint-Germain FC' },
  'paris saint-germain': { id: 524, name: 'Paris Saint-Germain FC' },
  'paris sg': { id: 524, name: 'Paris Saint-Germain FC' },
  'lorient': { id: 525, name: 'FC Lorient' },
  'rennes': { id: 529, name: 'Stade Rennais FC 1901' },
  'stade rennais': { id: 529, name: 'Stade Rennais FC 1901' },
  'angers': { id: 532, name: 'Angers SCO' },
  'le havre': { id: 533, name: 'Le Havre AC' },
  'nantes': { id: 543, name: 'FC Nantes' },
  'metz': { id: 545, name: 'FC Metz' },
  'lens': { id: 546, name: 'Racing Club de Lens' },
  'rc lens': { id: 546, name: 'Racing Club de Lens' },
  'monaco': { id: 548, name: 'AS Monaco FC' },
  'strasbourg': { id: 576, name: 'RC Strasbourg Alsace' },
  'paris fc': { id: 1045, name: 'Paris FC' },
  // Eredivisie / Portugal / Others
  'ajax': { id: 678, name: 'AFC Ajax' },
  'porto': { id: 503, name: 'FC Porto' },
  'benfica': { id: 498, name: 'SL Benfica' },
  'celtic': { id: 264, name: 'Celtic FC' },
  'rangers': { id: 258, name: 'Rangers FC' },
};

// Reverse map: team ID → TEAM_MAP key (used by slip generator for fixture lookup)
const TEAM_ID_TO_KEY = {};
for (const [key, val] of Object.entries(TEAM_MAP)) {
  if (!TEAM_ID_TO_KEY[val.id]) TEAM_ID_TO_KEY[val.id] = key;
}

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

// Domestic league competition codes only — excludes cups AND European comps
// Form/stats should match what BBC/Sky/FotMob show (domestic league only)
const LEAGUE_CODES = new Set([
  'PL',   // Premier League
  'BL1',  // Bundesliga
  'SA',   // Serie A
  'PD',   // La Liga
  'FL1',  // Ligue 1
  'PPL',  // Primeira Liga (Portugal)
  'DED',  // Eredivisie (Netherlands)
  'BSA',  // Brasileirão
]);

// Get recent LEAGUE matches for a team (excludes cups, European & friendlies)
async function getTeamMatches(teamId, limit = 10) {
  // Fetch more than needed so we have enough after filtering cups out
  const data = await fdGet(`/teams/${teamId}/matches?status=FINISHED&limit=${limit * 5}`);
  if (!data || !data.matches) return [];

  // Keep only domestic league matches — filter out cups AND European competition
  const leagueOnly = data.matches.filter(m =>
    m.competition && LEAGUE_CODES.has(m.competition.code)
  );

  // Sort newest first BEFORE slicing — API returns oldest first
  leagueOnly.sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

  return leagueOnly.slice(0, limit);
}

// Leagues to query individually (general /matches endpoint unreliable on free tier)
const FIXTURE_LEAGUES = ['PL', 'BL1', 'SA', 'PD', 'FL1', 'PPL', 'DED'];
const FIXTURE_LEAGUE_DELAY = 7000; // 7s between league queries (free tier: 10 req/min)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Fetch fixtures for a given date (default: today in UTC) across all covered leagues.
// Queries each competition individually — the general /matches endpoint is unreliable on free tier
async function getTodaysFixtures(date) {
  const target = date || new Date().toISOString().split('T')[0];
  const all = [];

  for (let i = 0; i < FIXTURE_LEAGUES.length; i++) {
    const code = FIXTURE_LEAGUES[i];
    const data = await fdGet(`/competitions/${code}/matches?status=SCHEDULED&dateFrom=${target}&dateTo=${target}`);
    if (data && data.matches) {
      const fixtures = data.matches
        .filter(m => TEAM_ID_TO_KEY[m.homeTeam.id] && TEAM_ID_TO_KEY[m.awayTeam.id])
        .map(m => ({
          homeKey: TEAM_ID_TO_KEY[m.homeTeam.id],
          awayKey: TEAM_ID_TO_KEY[m.awayTeam.id],
          homeTeamName: m.homeTeam.name,
          awayTeamName: m.awayTeam.name,
          kickoff: m.utcDate,
          competition: m.competition.name,
          competitionCode: m.competition.code,
          matchId: m.id,
        }));
      all.push(...fixtures);
    }
    if (i < FIXTURE_LEAGUES.length - 1) await sleep(FIXTURE_LEAGUE_DELAY);
  }

  // Sort by kickoff time ascending
  all.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return all;
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

// ─── Understat xG scraper ─────────────────────────────────────────────────────
// Understat embeds all match xG data as JSON inside the HTML page.
// No API key required — completely free.

const UNDERSTAT_TEAM_MAP = {
  // Premier League
  'arsenal fc': 'Arsenal', 'arsenal': 'Arsenal',
  'chelsea fc': 'Chelsea', 'chelsea': 'Chelsea',
  'liverpool fc': 'Liverpool', 'liverpool': 'Liverpool',
  'manchester city fc': 'Manchester_City', 'manchester city': 'Manchester_City', 'man city': 'Manchester_City',
  'manchester united fc': 'Manchester_United', 'manchester united': 'Manchester_United', 'man united': 'Manchester_United', 'man utd': 'Manchester_United',
  'tottenham hotspur fc': 'Tottenham', 'tottenham': 'Tottenham', 'spurs': 'Tottenham',
  'aston villa fc': 'Aston_Villa', 'aston villa': 'Aston_Villa',
  'newcastle united fc': 'Newcastle_United', 'newcastle': 'Newcastle_United',
  'west ham united fc': 'West_Ham', 'west ham': 'West_Ham',
  'brighton & hove albion fc': 'Brighton', 'brighton': 'Brighton',
  'wolverhampton wanderers fc': 'Wolverhampton_Wanderers', 'wolves': 'Wolverhampton_Wanderers', 'wolverhampton': 'Wolverhampton_Wanderers',
  'crystal palace fc': 'Crystal_Palace', 'crystal palace': 'Crystal_Palace',
  'brentford fc': 'Brentford', 'brentford': 'Brentford',
  'fulham fc': 'Fulham', 'fulham': 'Fulham',
  'everton fc': 'Everton', 'everton': 'Everton',
  'nottingham forest fc': 'Nottingham_Forest', 'nottingham forest': 'Nottingham_Forest', 'forest': 'Nottingham_Forest',
  'afc bournemouth': 'Bournemouth', 'bournemouth': 'Bournemouth',
  'leicester city fc': 'Leicester', 'leicester': 'Leicester',
  'ipswich town fc': 'Ipswich', 'ipswich': 'Ipswich',
  'southampton fc': 'Southampton', 'southampton': 'Southampton',
  // Bundesliga
  'fc bayern münchen': 'Bayern_Munich', 'bayern munich': 'Bayern_Munich', 'bayern': 'Bayern_Munich',
  'borussia dortmund': 'Borussia_Dortmund', 'dortmund': 'Borussia_Dortmund',
  'rb leipzig': 'RasenBallsport_Leipzig', 'leipzig': 'RasenBallsport_Leipzig',
  'bayer 04 leverkusen': 'Bayer_Leverkusen', 'bayer leverkusen': 'Bayer_Leverkusen', 'leverkusen': 'Bayer_Leverkusen',
  'eintracht frankfurt': 'Eintracht_Frankfurt', 'frankfurt': 'Eintracht_Frankfurt',
  'tsg 1899 hoffenheim': 'Hoffenheim', 'hoffenheim': 'Hoffenheim',
  'hamburger sv': 'Hamburger_SV', 'hsv': 'Hamburger_SV', 'hamburg': 'Hamburger_SV',
  'vfb stuttgart': 'VfB_Stuttgart', 'stuttgart': 'VfB_Stuttgart',
  'vfl wolfsburg': 'Wolfsburg', 'wolfsburg': 'Wolfsburg',
  'sv werder bremen': 'Werder_Bremen', 'werder bremen': 'Werder_Bremen', 'bremen': 'Werder_Bremen',
  '1. fsv mainz 05': 'Mainz_05', 'mainz': 'Mainz_05', 'mainz 05': 'Mainz_05',
  'fc augsburg': 'Augsburg', 'augsburg': 'Augsburg',
  'sc freiburg': 'Freiburg', 'freiburg': 'Freiburg',
  'borussia mönchengladbach': 'Borussia_M.Gladbach', 'gladbach': 'Borussia_M.Gladbach', 'monchengladbach': 'Borussia_M.Gladbach', 'mönchengladbach': 'Borussia_M.Gladbach',
  '1. fc union berlin': 'Union_Berlin', 'union berlin': 'Union_Berlin',
  '1. fc köln': 'FC_Cologne', 'koln': 'FC_Cologne', 'köln': 'FC_Cologne', 'cologne': 'FC_Cologne',
  '1. fc heidenheim 1846': 'FC_Heidenheim', 'heidenheim': 'FC_Heidenheim',
  'fc st. pauli': 'St._Pauli', 'st. pauli': 'St._Pauli', 'st pauli': 'St._Pauli',
  // La Liga
  'real madrid cf': 'Real_Madrid', 'real madrid': 'Real_Madrid',
  'fc barcelona': 'Barcelona', 'barcelona': 'Barcelona',
  'club atlético de madrid': 'Atletico_Madrid', 'atletico madrid': 'Atletico_Madrid', 'atletico': 'Atletico_Madrid',
  'sevilla fc': 'Sevilla', 'sevilla': 'Sevilla',
  'real sociedad de fútbol': 'Real_Sociedad', 'real sociedad': 'Real_Sociedad',
  'villarreal cf': 'Villarreal', 'villarreal': 'Villarreal',
  'athletic club': 'Athletic_Club', 'athletic bilbao': 'Athletic_Club',
  'real betis balompié': 'Real_Betis', 'real betis': 'Real_Betis',
  'ca osasuna': 'Osasuna', 'osasuna': 'Osasuna',
  'rcd espanyol de barcelona': 'Espanyol', 'espanyol': 'Espanyol',
  'getafe cf': 'Getafe', 'getafe': 'Getafe',
  'rayo vallecano de madrid': 'Rayo_Vallecano', 'rayo vallecano': 'Rayo_Vallecano', 'rayo': 'Rayo_Vallecano',
  'levante ud': 'Levante', 'levante': 'Levante',
  'rcd mallorca': 'Mallorca', 'mallorca': 'Mallorca',
  'valencia cf': 'Valencia', 'valencia': 'Valencia',
  'deportivo alavés': 'Alaves', 'alaves': 'Alaves',
  'girona fc': 'Girona', 'girona': 'Girona',
  'rc celta de vigo': 'Celta_Vigo', 'celta vigo': 'Celta_Vigo', 'celta': 'Celta_Vigo',
  // Serie A
  'juventus fc': 'Juventus', 'juventus': 'Juventus',
  'fc internazionale milano': 'Inter', 'inter milan': 'Inter', 'inter': 'Inter', 'internazionale': 'Inter',
  'ac milan': 'AC_Milan', 'milan': 'AC_Milan',
  'ssc napoli': 'Napoli', 'napoli': 'Napoli',
  'as roma': 'Roma', 'roma': 'Roma',
  'ss lazio': 'Lazio', 'lazio': 'Lazio',
  'atalanta bc': 'Atalanta', 'atalanta': 'Atalanta',
  'acf fiorentina': 'Fiorentina', 'fiorentina': 'Fiorentina',
  'bologna fc 1909': 'Bologna', 'bologna': 'Bologna',
  'cagliari calcio': 'Cagliari', 'cagliari': 'Cagliari',
  'genoa cfc': 'Genoa', 'genoa': 'Genoa',
  'parma calcio 1913': 'Parma', 'parma': 'Parma',
  'udinese calcio': 'Udinese', 'udinese': 'Udinese',
  'hellas verona fc': 'Verona', 'hellas verona': 'Verona', 'verona': 'Verona',
  'torino fc': 'Torino', 'torino': 'Torino',
  'us lecce': 'Lecce', 'lecce': 'Lecce',
  // Ligue 1
  'paris saint-germain fc': 'Paris_Saint_Germain', 'psg': 'Paris_Saint_Germain', 'paris saint-germain': 'Paris_Saint_Germain',
  'olympique de marseille': 'Marseille', 'marseille': 'Marseille',
  'olympique lyonnais': 'Lyon', 'lyon': 'Lyon',
  'as monaco fc': 'Monaco', 'monaco': 'Monaco',
  'lille osc': 'Lille', 'lille': 'Lille',
  'toulouse fc': 'Toulouse', 'toulouse': 'Toulouse',
  'stade brestois 29': 'Brest', 'brest': 'Brest',
  'aj auxerre': 'Auxerre', 'auxerre': 'Auxerre',
  'ogc nice': 'Nice', 'nice': 'Nice',
  'fc lorient': 'Lorient', 'lorient': 'Lorient',
  'stade rennais fc 1901': 'Rennes', 'rennes': 'Rennes', 'stade rennais': 'Rennes',
  'angers sco': 'Angers', 'angers': 'Angers',
  'le havre ac': 'Le_Havre', 'le havre': 'Le_Havre',
  'fc nantes': 'Nantes', 'nantes': 'Nantes',
  'racing club de lens': 'Lens', 'lens': 'Lens', 'rc lens': 'Lens',
  'rc strasbourg alsace': 'Strasbourg', 'strasbourg': 'Strasbourg',
};

// Determine current football season year (Aug–Jul cycle)
function currentSeason() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// Fetch xG data from Understat for a team
// Returns array of { date, xgFor, xgAgainst } or null on failure
// Uses the JSON AJAX endpoint (the old team-page scraper broke when Understat
// stopped embedding matchesData inline around Nov 2025).
async function getTeamXG(teamName) {
  const key = teamName.toLowerCase().trim();
  const understatName = UNDERSTAT_TEAM_MAP[key];
  if (!understatName) return null;

  const season = currentSeason();

  try {
    const url = `https://understat.com/getTeamData/${understatName}/${season}`;
    const res = await fetch(url, {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const matches = data?.dates;
    if (!Array.isArray(matches)) return null;

    // Only return completed matches with valid xG
    return matches
      .filter(m => m.isResult && m.xG && m.xG.h != null && m.xG.a != null)
      .map(m => ({
        date: m.datetime.split(' ')[0],        // "2025-08-17"
        side: m.side,                           // 'h' or 'a'
        xgFor:     parseFloat(m.side === 'h' ? m.xG.h : m.xG.a),
        xgAgainst: parseFloat(m.side === 'h' ? m.xG.a : m.xG.h),
      }));
  } catch {
    return null;
  }
}

// ─── Stats computation with exponential decay ─────────────────────────────────
// Recent matches carry more weight than older ones.
// Decay rate of 0.1 means a match 10 games ago carries ~37% of the weight
// of the most recent match (e^-1 ≈ 0.368).

// xG data is an array of { date, side, xgFor, xgAgainst } from Understat (optional)
function computeTeamStats(matches, teamId, xgData = null) {
  if (!matches.length) return null;

  const DECAY_RATE = 0.1;

  const sorted = [...matches].sort(
    (a, b) => new Date(b.utcDate) - new Date(a.utcDate)
  );

  // Overall accumulators
  let totalWeight = 0, weightedScored = 0, weightedConceded = 0;
  let xgTotalWeight = 0, weightedXgFor = 0, weightedXgAgainst = 0;

  // Home/Away split accumulators
  let homeWeight = 0, homeScored = 0, homeConceded = 0;
  let awayWeight = 0, awayScored = 0, awayConceded = 0;
  let homeXgW = 0, homeXgFor = 0, homeXgAgainst = 0;
  let awayXgW = 0, awayXgFor = 0, awayXgAgainst = 0;

  let wins = 0, draws = 0, losses = 0;
  const form = [];
  const homeFormArr = [];
  const awayFormArr = [];

  sorted.forEach((m, i) => {
    const isHome = m.homeTeam.id === teamId;
    const scored   = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    if (scored === null || conceded === null) return;

    const weight = Math.exp(-DECAY_RATE * i);

    // Overall
    totalWeight      += weight;
    weightedScored   += scored   * weight;
    weightedConceded += conceded * weight;

    // Home/Away split
    if (isHome) {
      homeWeight += weight; homeScored += scored * weight; homeConceded += conceded * weight;
    } else {
      awayWeight += weight; awayScored += scored * weight; awayConceded += conceded * weight;
    }

    // xG matching by date
    if (xgData) {
      const matchDate = new Date(m.utcDate).toISOString().split('T')[0];
      const xg = xgData.find(x => x.date === matchDate);
      if (xg) {
        xgTotalWeight     += weight;
        weightedXgFor     += xg.xgFor     * weight;
        weightedXgAgainst += xg.xgAgainst * weight;
        if (isHome) {
          homeXgW += weight; homeXgFor += xg.xgFor * weight; homeXgAgainst += xg.xgAgainst * weight;
        } else {
          awayXgW += weight; awayXgFor += xg.xgFor * weight; awayXgAgainst += xg.xgAgainst * weight;
        }
      }
    }

    const result = scored > conceded ? 'W' : scored === conceded ? 'D' : 'L';
    if (result === 'W') wins++;
    else if (result === 'D') draws++;
    else losses++;
    form.push(result);
    if (isHome) homeFormArr.push(result);
    else awayFormArr.push(result);
  });

  if (totalWeight === 0) return null;
  const played = wins + draws + losses;
  const hasXG  = xgTotalWeight > 0 && xgData && xgData.length >= 5;

  // Season-wide xG averages across the full Understat sample (usually ~30 matches).
  // Used to blend with recent-decayed figures so that a favourable/unfavourable
  // recent run of 10 games can't over- or under-state a team's true rate.
  // Example: Girona season xGA/g = 1.79 but last-10 decayed = 1.5 — the blend
  // keeps the defensive weakness visible instead of pricing it out.
  let seasonXgFor = null, seasonXgAgainst = null;
  if (hasXG && xgData.length >= 10) {
    const n = xgData.length;
    seasonXgFor     = xgData.reduce((s, m) => s + m.xgFor,     0) / n;
    seasonXgAgainst = xgData.reduce((s, m) => s + m.xgAgainst, 0) / n;
  }

  // Blend recent-decayed rate with season-wide rate. Season weight grows as recent
  // sample shrinks: 50/50 at 10+ matches, tilting toward season below that.
  const blendWithSeason = (recent, season, recentSamples) => {
    if (season == null) return recent;
    const recentWeight = Math.min(recentSamples / 10, 1.0) * 0.5; // max 0.5
    return recent * recentWeight + season * (1 - recentWeight);
  };

  // Overall averages (xG preferred, blended with season-wide when available)
  const recentAvgScored   = hasXG ? weightedXgFor     / xgTotalWeight : weightedScored   / totalWeight;
  const recentAvgConceded = hasXG ? weightedXgAgainst / xgTotalWeight : weightedConceded / totalWeight;
  const avgScored   = blendWithSeason(recentAvgScored,   seasonXgFor,     played);
  const avgConceded = blendWithSeason(recentAvgConceded, seasonXgAgainst, played);

  // Venue-split match counts (sample reliability for home/away rates)
  const homeMatches = sorted.filter(m => m.homeTeam.id === teamId && m.score.fullTime.home !== null).length;
  const awayMatches = sorted.filter(m => m.awayTeam.id === teamId && m.score.fullTime.home !== null).length;

  // Home-specific averages (blended against season xG when venue sample available)
  const rawHomeScored   = homeXgW > 0 ? homeXgFor     / homeXgW
                        : homeWeight > 0 ? homeScored  / homeWeight : avgScored;
  const rawHomeConceded = homeXgW > 0 ? homeXgAgainst / homeXgW
                        : homeWeight > 0 ? homeConceded / homeWeight : avgConceded;
  const homeAvgScored   = blendWithSeason(rawHomeScored,   seasonXgFor,     homeMatches);
  const homeAvgConceded = blendWithSeason(rawHomeConceded, seasonXgAgainst, homeMatches);

  // Away-specific averages
  const rawAwayScored   = awayXgW > 0 ? awayXgFor     / awayXgW
                        : awayWeight > 0 ? awayScored  / awayWeight : avgScored;
  const rawAwayConceded = awayXgW > 0 ? awayXgAgainst / awayXgW
                        : awayWeight > 0 ? awayConceded / awayWeight : avgConceded;
  const awayAvgScored   = blendWithSeason(rawAwayScored,   seasonXgFor,     awayMatches);
  const awayAvgConceded = blendWithSeason(rawAwayConceded, seasonXgAgainst, awayMatches);

  return {
    played, wins, draws, losses,
    avgScored, avgConceded,
    homeAvgScored, homeAvgConceded,   // Used when this team plays at home
    awayAvgScored, awayAvgConceded,   // Used when this team plays away
    usingXG: hasXG,
    form: form.slice(0, 5).join(''),
    homeForm: homeFormArr.slice(0, 5).join(''),  // Last 5 home games
    awayForm: awayFormArr.slice(0, 5).join(''),  // Last 5 away games
    points: wins * 3 + draws,
    confidence: Math.min(played / 10, 1.0),
  };
}

// ─── Head-to-Head ─────────────────────────────────────────────────────────────

async function getH2H(homeTeamId, awayTeamId) {
  // Fetch last 20 matches for the home team and filter for clashes with away team
  const data = await fdGet(`/teams/${homeTeamId}/matches?status=FINISHED&limit=20`);
  if (!data || !data.matches) return [];

  return data.matches
    .filter(m =>
      (m.homeTeam.id === homeTeamId && m.awayTeam.id === awayTeamId) ||
      (m.homeTeam.id === awayTeamId && m.awayTeam.id === homeTeamId)
    )
    .slice(0, 6); // Last 6 H2H meetings is enough
}

// Compute H2H win rates from the perspective of homeTeamId
function computeH2HStats(h2hMatches, homeTeamId) {
  if (!h2hMatches.length) return null;

  let wins = 0, draws = 0, losses = 0;

  for (const m of h2hMatches) {
    const hs = m.score.fullTime.home;
    const as = m.score.fullTime.away;
    if (hs === null || as === null) continue;

    const teamWasHome = m.homeTeam.id === homeTeamId;
    const teamScored   = teamWasHome ? hs : as;
    const teamConceded = teamWasHome ? as : hs;

    if (teamScored > teamConceded)       wins++;
    else if (teamScored === teamConceded) draws++;
    else                                  losses++;
  }

  const total = wins + draws + losses;
  if (total === 0) return null;

  return {
    matches: total,
    homeWinRate: wins   / total,
    drawRate:    draws  / total,
    awayWinRate: losses / total,
  };
}

// ─── Rest Days ────────────────────────────────────────────────────────────────

// Returns days since the team's most recent match (from already-fetched matches)
function getDaysSinceLastMatch(matches) {
  if (!matches || !matches.length) return null;
  const sorted = [...matches].sort(
    (a, b) => new Date(b.utcDate) - new Date(a.utcDate)
  );
  const lastMatchDate = new Date(sorted[0].utcDate);
  const now = new Date();
  return Math.floor((now - lastMatchDate) / (1000 * 60 * 60 * 24));
}

/**
 * Fatigue/rust multiplier based on days of rest.
 *
 *  ≤2 days  : 0.91 — 3rd match in 7 days, heavily fatigued
 *   3 days  : 0.95 — back-to-back fixture congestion
 *   4 days  : 0.97 — slightly tired
 *  5–10 days: 1.00 — ideal preparation window
 * 11–14 days: 0.99 — minor rustiness
 *  15+ days : 0.96 — long break, likely disrupted rhythm or injuries
 */
function computeRestFactor(days) {
  if (days === null) return 1.00;
  if (days <= 2)  return 0.91;
  if (days <= 3)  return 0.95;
  if (days <= 4)  return 0.97;
  if (days <= 10) return 1.00;
  if (days <= 14) return 0.99;
  return 0.96;
}

// Debug: returns raw matches from API before any filtering
async function getRawMatches(teamId, limit = 20) {
  const data = await fdGet(`/teams/${teamId}/matches?status=FINISHED&limit=${limit}`);
  if (!data || !data.matches) return [];
  return data.matches.map(m => ({
    date: m.utcDate.split('T')[0],
    competition: m.competition ? `${m.competition.name} (${m.competition.code})` : 'UNKNOWN',
    home: m.homeTeam.shortName || m.homeTeam.name,
    away: m.awayTeam.shortName || m.awayTeam.name,
    score: `${m.score.fullTime.home}-${m.score.fullTime.away}`,
    inLeagueFilter: m.competition ? LEAGUE_CODES.has(m.competition.code) : false,
  }));
}

module.exports = {
  searchTeam, getTeamMatches, getUpcomingMatch, getOdds,
  computeTeamStats, getTeamXG, getH2H, computeH2HStats,
  getDaysSinceLastMatch, computeRestFactor, getRawMatches,
  getTodaysFixtures,
};
