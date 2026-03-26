/**
 * Elo Rating System
 *
 * Elo gives each team a running strength rating that updates after every match.
 * It's more stable than short-term form because it accounts for opponent quality.
 *
 * Formula:
 *   newElo = oldElo + K × (actual − expected)
 *   expected = 1 / (1 + 10^((opponentElo − teamElo) / 400))
 *
 * We seed each team with a historically-calibrated starting Elo,
 * then apply updates from the last 10 fetched matches.
 * No persistent storage needed — recalculated fresh every prediction.
 */

// ─── Seed Elo ratings (football-data.org team IDs) ────────────────────────────
// Based on multi-season historical performance as of 2025/26
const SEED_ELO = {
  // Premier League
  57:   1900,  // Arsenal
  61:   1810,  // Chelsea
  64:   1930,  // Liverpool
  65:   1960,  // Manchester City
  66:   1730,  // Manchester United
  73:   1770,  // Tottenham Hotspur
  58:   1780,  // Aston Villa
  67:   1760,  // Newcastle United
  563:  1650,  // West Ham United
  397:  1710,  // Brighton
  76:   1640,  // Wolverhampton
  354:  1630,  // Crystal Palace
  402:  1660,  // Brentford
  63:   1680,  // Fulham
  62:   1600,  // Everton
  351:  1700,  // Nottingham Forest
  1044: 1620,  // Bournemouth
  338:  1600,  // Leicester City
  349:  1580,  // Ipswich Town
  340:  1570,  // Southampton

  // Bundesliga
  5:    1990,  // Bayern Munich
  4:    1860,  // Borussia Dortmund
  721:  1830,  // RB Leipzig
  3:    1880,  // Bayer Leverkusen
  19:   1750,  // Eintracht Frankfurt
  11:   1720,  // Wolfsburg
  17:   1710,  // Freiburg

  // La Liga
  86:   2010,  // Real Madrid
  81:   1970,  // Barcelona
  78:   1890,  // Atletico Madrid
  559:  1730,  // Sevilla
  92:   1750,  // Real Sociedad
  94:   1720,  // Villarreal
  77:   1730,  // Athletic Club
  90:   1700,  // Real Betis

  // Serie A
  108:  1870,  // Inter Milan
  98:   1820,  // AC Milan
  109:  1830,  // Juventus
  113:  1810,  // Napoli
  100:  1760,  // Roma
  110:  1750,  // Lazio
  102:  1800,  // Atalanta
  99:   1720,  // Fiorentina

  // Ligue 1
  524:  1920,  // PSG
  516:  1750,  // Marseille
  523:  1740,  // Lyon
  548:  1760,  // Monaco
  521:  1750,  // Lille

  // Others
  678:  1790,  // Ajax
  503:  1800,  // Porto
  498:  1810,  // Benfica
  264:  1720,  // Celtic
  258:  1700,  // Rangers
};

const DEFAULT_ELO    = 1500;
const K_FACTOR       = 20;    // Weight per match — standard for club football
const HOME_ELO_BONUS = 100;   // Equivalent to home advantage in Elo space

// Expected result (win probability) for team A vs team B given Elo ratings
function eloExpected(eloA, eloB) {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

// Get seed Elo for a team ID (or default if unknown)
function getSeedElo(teamId) {
  return SEED_ELO[teamId] || DEFAULT_ELO;
}

/**
 * Calculate live Elo for a team from seed + recent match history.
 * Processes matches oldest→newest to accumulate rating changes.
 * opponentEloMap: { teamId: elo } for known opponents (optional)
 */
function calculateElo(teamId, matches, opponentEloMap = {}) {
  const sorted = [...matches].sort(
    (a, b) => new Date(a.utcDate) - new Date(b.utcDate)
  );

  let elo = getSeedElo(teamId);

  for (const m of sorted) {
    const isHome   = m.homeTeam.id === teamId;
    const scored   = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;
    if (scored === null || conceded === null) continue;

    const opponentId  = isHome ? m.awayTeam.id : m.homeTeam.id;
    const opponentElo = opponentEloMap[opponentId] || getSeedElo(opponentId);

    // Home team gets Elo bonus when calculating expected result
    const adjustedElo = isHome ? elo + HOME_ELO_BONUS : elo;
    const expected    = eloExpected(adjustedElo, opponentElo);
    const actual      = scored > conceded ? 1 : scored === conceded ? 0.5 : 0;

    elo += K_FACTOR * (actual - expected);
  }

  return Math.round(elo);
}

/**
 * Convert Elo difference into an xG strength multiplier.
 * A 200-point Elo gap = roughly 10% xG adjustment.
 * Capped at ±25% to prevent extreme swings.
 */
function eloStrengthMultiplier(teamElo, opponentElo) {
  const diff = teamElo - opponentElo;
  const multiplier = 1 + (diff / 2000);
  return Math.max(0.75, Math.min(1.25, multiplier)); // Cap: ±25%
}

/**
 * Human-readable Elo tier label
 */
function eloLabel(elo) {
  if (elo >= 1950) return 'Elite';
  if (elo >= 1850) return 'World Class';
  if (elo >= 1750) return 'Strong';
  if (elo >= 1650) return 'Above Average';
  if (elo >= 1550) return 'Average';
  return 'Below Average';
}

module.exports = { calculateElo, getSeedElo, eloExpected, eloStrengthMultiplier, eloLabel };
