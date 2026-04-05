/**
 * Daily Betting Slip Generator
 * Fetches today's fixtures, runs full analysis on each, builds a structured slip
 */

const { getTodaysFixtures } = require('./fetcher');
const { analyzMatch } = require('./predictor');
const { overProbabilities } = require('./poisson');

// ─── Thresholds ───────────────────────────────────────────────────────────────
const OUTCOME_THRESHOLD = 0.65;  // 65%+ → direct outcome pick (High Confidence)
const HEDGE_THRESHOLD   = 0.80;  // 80%+ → double chance hedge
const OVER_THRESHOLD    = 0.75;  // 75%+ → OVER goals recommendation

// Rate limiting: football-data.org free tier = 10 calls/min
// Each match uses ~3 API calls → safe to process one match every 22 seconds
const RATE_LIMIT_DELAY = 22000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Reason builder ───────────────────────────────────────────────────────────

function buildReason(result, betType) {
  const { homeTeam, awayTeam, homeStats, awayStats, elo, h2h, rest } = result;
  const p = result.prediction.probabilities;
  const reasons = [];

  if (betType === 'home' || betType === 'dc_home') {
    if (homeStats.form) {
      const wins = homeStats.form.split('').filter(c => c === 'W').length;
      if (wins >= 3) reasons.push(`${homeTeam} ${wins}W last 5`);
    }
    if (elo && elo.home > elo.away + 80) reasons.push(`Elo edge +${elo.home - elo.away}pts`);
    if (awayStats.avgConceded > 1.4) reasons.push(`${awayTeam} leaking ${awayStats.avgConceded.toFixed(1)} goals/g`);
    if (homeStats.avgScored > 1.8) reasons.push(`${homeTeam} scoring ${homeStats.avgScored.toFixed(1)}/g`);
  } else if (betType === 'away' || betType === 'dc_away') {
    if (awayStats.form) {
      const wins = awayStats.form.split('').filter(c => c === 'W').length;
      if (wins >= 3) reasons.push(`${awayTeam} ${wins}W last 5`);
    }
    if (elo && elo.away > elo.home + 80) reasons.push(`Elo edge +${elo.away - elo.home}pts`);
    if (homeStats.avgConceded > 1.4) reasons.push(`${homeTeam} leaking ${homeStats.avgConceded.toFixed(1)} goals/g`);
    if (awayStats.avgScored > 1.8) reasons.push(`${awayTeam} scoring ${awayStats.avgScored.toFixed(1)}/g`);
  } else if (betType === 'draw') {
    if (elo && Math.abs(elo.home - elo.away) < 60) reasons.push('Elo ratings nearly equal');
    if (h2h && h2h.matches >= 3 && h2h.drawRate > 0.3) reasons.push(`H2H draws ${Math.round(h2h.drawRate * 100)}%`);
  }

  if (h2h && h2h.matches >= 3) {
    if (betType === 'home' && h2h.homeWinRate > 0.55) reasons.push(`H2H ${Math.round(h2h.homeWinRate * 100)}% home wins`);
    if (betType === 'away' && h2h.awayWinRate > 0.55) reasons.push(`H2H ${Math.round(h2h.awayWinRate * 100)}% away wins`);
  }

  if (rest) {
    if ((betType === 'home' || betType === 'dc_home') && rest.homeRestFactor >= 1.0 && rest.awayRestFactor < 0.97) {
      reasons.push(`${awayTeam} fatigued (${rest.awayDays}d rest)`);
    }
    if ((betType === 'away' || betType === 'dc_away') && rest.awayRestFactor >= 1.0 && rest.homeRestFactor < 0.97) {
      reasons.push(`${homeTeam} fatigued (${rest.homeDays}d rest)`);
    }
  }

  const bestProb = Math.max(p.homeWin, p.draw, p.awayWin);
  if (!reasons.length) reasons.push(`Model confidence ${Math.round(bestProb * 100)}%`);

  return reasons.slice(0, 3).join('; ');
}

function buildOverReason(result, overProbs) {
  const { homeTeam, awayTeam, homeStats, awayStats, h2h } = result;
  const xg = result.prediction.expectedGoals;
  const reasons = [];

  reasons.push(`xG total ${(xg.home + xg.away).toFixed(1)} goals`);
  if (homeStats.avgScored > 1.7) reasons.push(`${homeTeam} scores ${homeStats.avgScored.toFixed(1)}/g`);
  if (awayStats.avgScored > 1.7) reasons.push(`${awayTeam} scores ${awayStats.avgScored.toFixed(1)}/g`);
  if (homeStats.avgConceded > 1.5) reasons.push(`${homeTeam} concedes ${homeStats.avgConceded.toFixed(1)}/g`);
  if (awayStats.avgConceded > 1.5) reasons.push(`${awayTeam} concedes ${awayStats.avgConceded.toFixed(1)}/g`);

  return reasons.slice(0, 3).join('; ');
}

// ─── Main slip generator ──────────────────────────────────────────────────────

async function generateDailySlip() {
  const fixtures = await getTodaysFixtures();

  if (!fixtures.length) {
    return { fixtures: [], highConfidence: [], hedges: [], overs: [], analyzedCount: 0, noFixtures: true };
  }

  console.log(`[slip] Found ${fixtures.length} fixture(s) today. Analyzing...`);

  const results = [];

  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    try {
      console.log(`[slip] ${i + 1}/${fixtures.length}: ${fixture.homeTeamName} vs ${fixture.awayTeamName}`);
      const result = await analyzMatch(fixture.homeKey, fixture.awayKey);
      if (!result.error) results.push({ fixture, result });
    } catch (e) {
      console.error(`[slip] Error on ${fixture.homeTeamName} vs ${fixture.awayTeamName}:`, e.message);
    }
    // Respect rate limit between matches (skip delay after last match)
    if (i < fixtures.length - 1) await sleep(RATE_LIMIT_DELAY);
  }

  const highConfidence = [];
  const hedges        = [];
  const overs         = [];

  for (const { fixture, result } of results) {
    const p   = result.prediction.probabilities;
    const xg  = result.prediction.expectedGoals;
    const ops = overProbabilities(xg.home, xg.away);

    // ── Match outcome ─────────────────────────────────────────────────────────
    const outcomes = [
      { type: 'home', label: `${result.homeTeam} Win`, prob: p.homeWin },
      { type: 'draw', label: 'Draw',                    prob: p.draw    },
      { type: 'away', label: `${result.awayTeam} Win`, prob: p.awayWin },
    ];
    const best = [...outcomes].sort((a, b) => b.prob - a.prob)[0];

    // ── Double chance ─────────────────────────────────────────────────────────
    const dcOptions = [
      { type: 'dc_home',   label: `${result.homeTeam} or Draw (1X)`,              prob: p.homeWin + p.draw   },
      { type: 'dc_away',   label: `${result.awayTeam} or Draw (X2)`,              prob: p.awayWin + p.draw   },
      { type: 'dc_either', label: `${result.homeTeam} or ${result.awayTeam} (12)`, prob: p.homeWin + p.awayWin },
    ];
    const bestDC = [...dcOptions].sort((a, b) => b.prob - a.prob)[0];

    if (best.prob >= OUTCOME_THRESHOLD) {
      highConfidence.push({ fixture, result, bet: best, overProbs: ops, reason: buildReason(result, best.type) });
    } else if (bestDC.prob >= HEDGE_THRESHOLD) {
      hedges.push({ fixture, result, bet: bestDC, overProbs: ops, reason: buildReason(result, bestDC.type) });
    }

    // ── OVERS (evaluated independently for every match) ───────────────────────
    let bestOver = null;
    if      (ops.over35 >= OVER_THRESHOLD) bestOver = { line: 'OVER 3.5', prob: ops.over35 };
    else if (ops.over25 >= OVER_THRESHOLD) bestOver = { line: 'OVER 2.5', prob: ops.over25 };
    else if (ops.over15 >= OVER_THRESHOLD) bestOver = { line: 'OVER 1.5', prob: ops.over15 };

    if (bestOver) {
      overs.push({ fixture, result, bet: bestOver, overProbs: ops, reason: buildOverReason(result, ops) });
    }
  }

  return { fixtures, highConfidence, hedges, overs, analyzedCount: results.length };
}

module.exports = { generateDailySlip };
