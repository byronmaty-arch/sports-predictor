/**
 * Injury Impact System
 * Maps player absences to xG multipliers
 *
 * attackImpact  = fraction of team xG lost when this player is absent
 * defenceImpact = fraction increase in xGA when this player is absent
 *
 * Tiers:
 *   Elite striker / key creator : 0.25–0.32
 *   Important regular starter   : 0.12–0.20
 *   Squad / rotation player     : 0.06–0.10
 */

const PLAYER_IMPACT = {
  // ── Liverpool ───────────────────────────────────────────────────────────────
  'salah':          { team: 'liverpool', attackImpact: 0.28, defenceImpact: 0.00 },
  'nunez':          { team: 'liverpool', attackImpact: 0.18, defenceImpact: 0.00 },
  'diaz':           { team: 'liverpool', attackImpact: 0.12, defenceImpact: 0.00 },
  'gakpo':          { team: 'liverpool', attackImpact: 0.12, defenceImpact: 0.00 },
  'van dijk':       { team: 'liverpool', attackImpact: 0.00, defenceImpact: 0.16 },
  'alisson':        { team: 'liverpool', attackImpact: 0.00, defenceImpact: 0.14 },

  // ── Arsenal ─────────────────────────────────────────────────────────────────
  'saka':           { team: 'arsenal', attackImpact: 0.24, defenceImpact: 0.00 },
  'odegaard':       { team: 'arsenal', attackImpact: 0.20, defenceImpact: 0.00 },
  'havertz':        { team: 'arsenal', attackImpact: 0.15, defenceImpact: 0.00 },
  'martinelli':     { team: 'arsenal', attackImpact: 0.14, defenceImpact: 0.00 },
  'trossard':       { team: 'arsenal', attackImpact: 0.12, defenceImpact: 0.00 },
  'white':          { team: 'arsenal', attackImpact: 0.00, defenceImpact: 0.12 },
  'gabriel':        { team: 'arsenal', attackImpact: 0.00, defenceImpact: 0.13 },

  // ── Manchester City ─────────────────────────────────────────────────────────
  'haaland':        { team: 'manchester city', attackImpact: 0.32, defenceImpact: 0.00 },
  'de bruyne':      { team: 'manchester city', attackImpact: 0.22, defenceImpact: 0.00 },
  'foden':          { team: 'manchester city', attackImpact: 0.18, defenceImpact: 0.00 },
  'bernardo silva': { team: 'manchester city', attackImpact: 0.12, defenceImpact: 0.00 },
  'grealish':       { team: 'manchester city', attackImpact: 0.10, defenceImpact: 0.00 },

  // ── Chelsea ─────────────────────────────────────────────────────────────────
  'palmer':         { team: 'chelsea', attackImpact: 0.30, defenceImpact: 0.00 },
  'jackson':        { team: 'chelsea', attackImpact: 0.18, defenceImpact: 0.00 },
  'mudryk':         { team: 'chelsea', attackImpact: 0.12, defenceImpact: 0.00 },
  'nkunku':         { team: 'chelsea', attackImpact: 0.14, defenceImpact: 0.00 },

  // ── Manchester United ───────────────────────────────────────────────────────
  'fernandes':      { team: 'manchester united', attackImpact: 0.22, defenceImpact: 0.00 },
  'rashford':       { team: 'manchester united', attackImpact: 0.18, defenceImpact: 0.00 },
  'hojlund':        { team: 'manchester united', attackImpact: 0.18, defenceImpact: 0.00 },
  'mount':          { team: 'manchester united', attackImpact: 0.12, defenceImpact: 0.00 },

  // ── Tottenham ───────────────────────────────────────────────────────────────
  'son':            { team: 'tottenham', attackImpact: 0.24, defenceImpact: 0.00 },
  'maddison':       { team: 'tottenham', attackImpact: 0.20, defenceImpact: 0.00 },
  'richarlison':    { team: 'tottenham', attackImpact: 0.14, defenceImpact: 0.00 },

  // ── Newcastle ───────────────────────────────────────────────────────────────
  'isak':           { team: 'newcastle', attackImpact: 0.28, defenceImpact: 0.00 },
  'gordon':         { team: 'newcastle', attackImpact: 0.16, defenceImpact: 0.00 },
  'trippier':       { team: 'newcastle', attackImpact: 0.10, defenceImpact: 0.08 },

  // ── Aston Villa ─────────────────────────────────────────────────────────────
  'watkins':        { team: 'aston villa', attackImpact: 0.26, defenceImpact: 0.00 },
  'diaby':          { team: 'aston villa', attackImpact: 0.16, defenceImpact: 0.00 },
  'mcginn':         { team: 'aston villa', attackImpact: 0.10, defenceImpact: 0.00 },

  // ── Bayern Munich ───────────────────────────────────────────────────────────
  'kane':           { team: 'bayern munich', attackImpact: 0.30, defenceImpact: 0.00 },
  'musiala':        { team: 'bayern munich', attackImpact: 0.20, defenceImpact: 0.00 },
  'sane':           { team: 'bayern munich', attackImpact: 0.15, defenceImpact: 0.00 },

  // ── Borussia Dortmund ────────────────────────────────────────────────────────
  'fullkrug':       { team: 'dortmund', attackImpact: 0.22, defenceImpact: 0.00 },
  'brandt':         { team: 'dortmund', attackImpact: 0.16, defenceImpact: 0.00 },

  // ── Real Madrid ─────────────────────────────────────────────────────────────
  'mbappe':         { team: 'real madrid', attackImpact: 0.28, defenceImpact: 0.00 },
  'vinicius':       { team: 'real madrid', attackImpact: 0.26, defenceImpact: 0.00 },
  'bellingham':     { team: 'real madrid', attackImpact: 0.22, defenceImpact: 0.00 },
  'rodrygo':        { team: 'real madrid', attackImpact: 0.14, defenceImpact: 0.00 },

  // ── Barcelona ───────────────────────────────────────────────────────────────
  'lewandowski':    { team: 'barcelona', attackImpact: 0.28, defenceImpact: 0.00 },
  'yamal':          { team: 'barcelona', attackImpact: 0.24, defenceImpact: 0.00 },
  'raphinha':       { team: 'barcelona', attackImpact: 0.20, defenceImpact: 0.00 },

  // ── Atletico Madrid ─────────────────────────────────────────────────────────
  'griezmann':      { team: 'atletico madrid', attackImpact: 0.24, defenceImpact: 0.00 },
  'morata':         { team: 'atletico madrid', attackImpact: 0.20, defenceImpact: 0.00 },

  // ── Inter Milan ─────────────────────────────────────────────────────────────
  'lautaro':        { team: 'inter milan', attackImpact: 0.26, defenceImpact: 0.00 },
  'thuram':         { team: 'inter milan', attackImpact: 0.18, defenceImpact: 0.00 },

  // ── AC Milan ────────────────────────────────────────────────────────────────
  'leao':           { team: 'ac milan', attackImpact: 0.26, defenceImpact: 0.00 },
  'giroud':         { team: 'ac milan', attackImpact: 0.20, defenceImpact: 0.00 },

  // ── Juventus ────────────────────────────────────────────────────────────────
  'vlahovic':       { team: 'juventus', attackImpact: 0.26, defenceImpact: 0.00 },
  'chiesa':         { team: 'juventus', attackImpact: 0.18, defenceImpact: 0.00 },

  // ── Napoli ──────────────────────────────────────────────────────────────────
  'osimhen':        { team: 'napoli', attackImpact: 0.30, defenceImpact: 0.00 },
  'kvaratskhelia':  { team: 'napoli', attackImpact: 0.24, defenceImpact: 0.00 },

  // ── PSG ─────────────────────────────────────────────────────────────────────
  'dembele':        { team: 'psg', attackImpact: 0.22, defenceImpact: 0.00 },
  'barcola':        { team: 'psg', attackImpact: 0.20, defenceImpact: 0.00 },
  'asensio':        { team: 'psg', attackImpact: 0.14, defenceImpact: 0.00 },
};

// Default impact for any player not in the database
const DEFAULT_ATTACK_IMPACT  = 0.10;
const DEFAULT_DEFENCE_IMPACT = 0.08;

// Parse "Salah, Nunez" → ['salah', 'nunez']
function parseInjuryList(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// Returns xG multipliers from a list of absent player names
function computeInjuryFactor(playerNames) {
  if (!playerNames || playerNames.length === 0) return null;

  let totalAttack  = 0;
  let totalDefence = 0;
  const found   = [];
  const unknown = [];

  for (const name of playerNames) {
    const key = Object.keys(PLAYER_IMPACT).find(
      k => k === name || name.includes(k) || k.includes(name)
    );

    if (key) {
      const p = PLAYER_IMPACT[key];
      totalAttack  += p.attackImpact;
      totalDefence += p.defenceImpact;
      found.push({ name: key, attackImpact: p.attackImpact, defenceImpact: p.defenceImpact });
    } else {
      totalAttack += DEFAULT_ATTACK_IMPACT;
      unknown.push(name);
    }
  }

  // Cap: even without multiple stars, team still functions
  totalAttack  = Math.min(totalAttack,  0.60);
  totalDefence = Math.min(totalDefence, 0.40);

  return {
    attackMultiplier:  1 - totalAttack,   // < 1 means fewer goals scored
    defenceMultiplier: 1 + totalDefence,  // > 1 means more goals conceded
    found,
    unknown,
    totalAttackImpact:  totalAttack,
    totalDefenceImpact: totalDefence,
  };
}

module.exports = { parseInjuryList, computeInjuryFactor };
