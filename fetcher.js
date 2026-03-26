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

// League competition codes — exclude cups, friendlies, play-offs
const LEAGUE_CODES = new Set([
  'PL',   // Premier League
  'BL1',  // Bundesliga
  'SA',   // Serie A
  'PD',   // La Liga
  'FL1',  // Ligue 1
  'PPL',  // Primeira Liga (Portugal)
  'DED',  // Eredivisie (Netherlands)
  'BSA',  // Brasileirão
  'CL',   // Champions League (group/knockout — still meaningful)
  'EL',   // Europa League
  'EC',   // European Championship
]);

// Get recent LEAGUE matches for a team (excludes cups & friendlies)
async function getTeamMatches(teamId, limit = 10) {
  // Fetch more than needed so we have enough after filtering cups out
  const data = await fdGet(`/teams/${teamId}/matches?status=FINISHED&limit=${limit * 3}`);
  if (!data || !data.matches) return [];

  // Keep only league/European matches — filter out domestic cups
  const leagueOnly = data.matches.filter(m =>
    m.competition && LEAGUE_CODES.has(m.competition.code)
  );

  return leagueOnly.slice(0, limit);
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
  'borussia dortmund': 'Dortmund', 'dortmund': 'Dortmund',
  'rb leipzig': 'RB_Leipzig', 'leipzig': 'RB_Leipzig',
  'bayer 04 leverkusen': 'Bayer_Leverkusen', 'bayer leverkusen': 'Bayer_Leverkusen', 'leverkusen': 'Bayer_Leverkusen',
  'eintracht frankfurt': 'Eintracht_Frankfurt', 'frankfurt': 'Eintracht_Frankfurt',
  // La Liga
  'real madrid cf': 'Real_Madrid', 'real madrid': 'Real_Madrid',
  'fc barcelona': 'Barcelona', 'barcelona': 'Barcelona',
  'club atlético de madrid': 'Atletico_Madrid', 'atletico madrid': 'Atletico_Madrid', 'atletico': 'Atletico_Madrid',
  'sevilla fc': 'Sevilla', 'sevilla': 'Sevilla',
  'real sociedad de fútbol': 'Real_Sociedad', 'real sociedad': 'Real_Sociedad',
  'villarreal cf': 'Villarreal', 'villarreal': 'Villarreal',
  'athletic club': 'Athletic_Club', 'athletic bilbao': 'Athletic_Club',
  'real betis balompié': 'Real_Betis', 'real betis': 'Real_Betis',
  // Serie A
  'juventus fc': 'Juventus', 'juventus': 'Juventus',
  'fc internazionale milano': 'Internazionale', 'inter milan': 'Internazionale', 'inter': 'Internazionale', 'internazionale': 'Internazionale',
  'ac milan': 'AC_Milan', 'milan': 'AC_Milan',
  'ssc napoli': 'Napoli', 'napoli': 'Napoli',
  'as roma': 'Roma', 'roma': 'Roma',
  'ss lazio': 'Lazio', 'lazio': 'Lazio',
  'atalanta bc': 'Atalanta', 'atalanta': 'Atalanta',
  'acf fiorentina': 'Fiorentina', 'fiorentina': 'Fiorentina',
  // Ligue 1
  'paris saint-germain fc': 'Paris_Saint_Germain', 'psg': 'Paris_Saint_Germain', 'paris saint-germain': 'Paris_Saint_Germain',
  'olympique de marseille': 'Marseille', 'marseille': 'Marseille',
  'olympique lyonnais': 'Lyon', 'lyon': 'Lyon',
  'as monaco fc': 'Monaco', 'monaco': 'Monaco',
  'losc lille': 'Lille', 'lille': 'Lille',
};

// Determine current football season year (Aug–Jul cycle)
function currentSeason() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

// Fetch xG data from Understat for a team
// Returns array of { date, xgFor, xgAgainst } or null on failure
async function getTeamXG(teamName) {
  const key = teamName.toLowerCase().trim();
  const understatName = UNDERSTAT_TEAM_MAP[key];
  if (!understatName) return null;

  const season = currentSeason();

  try {
    const url = `https://understat.com/team/${understatName}/${season}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Understat embeds data as: var matchesData = JSON.parse('...')
    const raw = html.match(/var matchesData\s*=\s*JSON\.parse\('(.+?)'\)/s);
    if (!raw) return null;

    // Decode \xNN hex escapes and unescape quotes
    const jsonStr = raw[1]
      .replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\\\/g, '\\')
      .replace(/\\'/g, "'");

    const matches = JSON.parse(jsonStr);

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

    if (scored > conceded)       { wins++;  form.push('W'); }
    else if (scored === conceded) { draws++; form.push('D'); }
    else                          { losses++; form.push('L'); }
  });

  if (totalWeight === 0) return null;
  const played = wins + draws + losses;
  const hasXG  = xgTotalWeight > 0 && xgData && xgData.length >= 5;

  // Overall averages (xG preferred)
  const avgScored   = hasXG ? weightedXgFor     / xgTotalWeight : weightedScored   / totalWeight;
  const avgConceded = hasXG ? weightedXgAgainst / xgTotalWeight : weightedConceded / totalWeight;

  // Home-specific averages
  const homeAvgScored   = homeXgW > 0 ? homeXgFor     / homeXgW
                        : homeWeight > 0 ? homeScored  / homeWeight : avgScored;
  const homeAvgConceded = homeXgW > 0 ? homeXgAgainst / homeXgW
                        : homeWeight > 0 ? homeConceded / homeWeight : avgConceded;

  // Away-specific averages
  const awayAvgScored   = awayXgW > 0 ? awayXgFor     / awayXgW
                        : awayWeight > 0 ? awayScored  / awayWeight : avgScored;
  const awayAvgConceded = awayXgW > 0 ? awayXgAgainst / awayXgW
                        : awayWeight > 0 ? awayConceded / awayWeight : avgConceded;

  return {
    played, wins, draws, losses,
    avgScored, avgConceded,
    homeAvgScored, homeAvgConceded,   // Used when this team plays at home
    awayAvgScored, awayAvgConceded,   // Used when this team plays away
    usingXG: hasXG,
    form: form.slice(0, 5).join(''),
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
};
