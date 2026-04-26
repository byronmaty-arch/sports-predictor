/**
 * Daily Betting Slip Generator
 * Fetches today's fixtures, runs full analysis on each, builds a structured slip
 */

const { getTodaysFixtures } = require('./fetcher');
const { analyzMatch } = require('./predictor');
const { overProbabilitiesDampened } = require('./poisson');

// ─── Thresholds ───────────────────────────────────────────────────────────────
const OUTCOME_THRESHOLD    = 0.65;  // 65%+ → eligible for picks
const BORDERLINE_THRESHOLD = 0.70;  // 65-70% → double chance (not outright); ≥70% → outright high-conf
const HEDGE_THRESHOLD      = 0.80;  // 80%+ DC → hedge even without outright pick
const OVER_THRESHOLD       = 0.75;  // 75%+ → OVER goals recommendation
const OVER_THRESHOLD_EVEN  = 0.80;  // Evenly-matched games (|eloGap| < 100) need a higher bar
const EVEN_MATCH_ELO_GAP   = 100;   // Below this, treat the fixture as evenly matched

// ─── Home-side pick safety filters ────────────────────────────────────────────
// Added after 18/04 backtest: home favourites dropped points vs close-strength
// away teams (Udinese-Parma, Napoli-Lazio, Chelsea-Man Utd) despite high DC probs.
const AWAY_WIN_FLOOR       = 0.22;  // Reject home/DC-home pick if away has ≥22% win chance
const CLOSE_MATCH_ELO_GAP  = 60;    // Reject home/DC-home pick if opponent within 60 Elo pts
const MIN_HOME_WIN_FOR_DC_HEDGE = 0.45; // dc_home via HEDGE_THRESHOLD needs home ≥45% — else the pick is propped up by draw prob, not home dominance

// ─── OVER xG-total floors ─────────────────────────────────────────────────────
// Defensive low-scoring matches (e.g. Lille-Nice 0-0 on 18/04) can hit the
// probability threshold with inflated lambdas from optimistic stats/Elo inputs.
// Calibrated against the Poisson-Dixon-Coles model: O2.5 normally needs xG
// total ≈ 4.0 to reach 75% prob; requiring ≥3.3 rejects picks where lambdas
// are near the boundary and small input errors could flip the outcome.
const OVER_XG_FLOOR = {
  over15: 2.5,   // Prevents "both teams defensive" low-total matches
  over25: 3.3,   // Cushion below the natural ~4.0 xG for 75% prob
  over35: 4.2,   // Strong-attack matches only
};

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

async function generateDailySlip(date) {
  const fixtures = await getTodaysFixtures(date);

  if (!fixtures.length) {
    return { fixtures: [], highConfidence: [], hedges: [], overs: [], analyzedCount: 0, noFixtures: true, targetDate: date };
  }

  console.log(`[slip] Found ${fixtures.length} fixture(s)${date ? ` for ${date}` : ' today'}. Analyzing...`);

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
    const ops = overProbabilitiesDampened(xg.home, xg.away, p.homeWin, p.awayWin);
    const eloGap = (result.elo?.home ?? 1500) - (result.elo?.away ?? 1500);

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

    // Draw risk: skip home win picks flagged as draw risk (borderline or giant-killer Elo gap)
    const isDrawRiskPick = best.type === 'home' && result.drawRisk;

    // Opponent-strength gate for any home-side pick (outright 1 or DC 1X).
    // Fires when the away team has a real upset chance OR is essentially equal
    // in Elo — both patterns produced losses on 18/04 (Udinese, Napoli, Chelsea).
    const homeSideUnsafe = (p.awayWin >= AWAY_WIN_FLOOR) || (eloGap < CLOSE_MATCH_ELO_GAP);

    const logSkip = (match, reason) =>
      console.log(`[slip] SKIP ${match}: ${reason}`);

    const matchLabel = `${result.homeTeam} vs ${result.awayTeam}`;

    if (best.prob >= BORDERLINE_THRESHOLD && !isDrawRiskPick && !result.lowDataWarning) {
      // ≥70% and no draw risk and enough data → outright high-confidence pick
      if (best.type === 'home' && homeSideUnsafe) {
        logSkip(matchLabel, `home outright pick vetoed (awayWin ${(p.awayWin*100).toFixed(0)}%, eloGap ${eloGap})`);
      } else {
        highConfidence.push({ fixture, result, bet: best, overProbs: ops, reason: buildReason(result, best.type) });
      }
    } else if (best.prob >= OUTCOME_THRESHOLD && !isDrawRiskPick && !result.lowDataWarning) {
      // 65–69%: borderline confidence → route to double chance for safety
      const dcBet = best.type === 'away'
        ? dcOptions.find(d => d.type === 'dc_away')
        : dcOptions.find(d => d.type === 'dc_home');
      const pick = dcBet || bestDC;
      if (pick.type === 'dc_home' && homeSideUnsafe) {
        logSkip(matchLabel, `borderline DC 1X vetoed (awayWin ${(p.awayWin*100).toFixed(0)}%, eloGap ${eloGap})`);
      } else {
        hedges.push({ fixture, result, bet: pick, overProbs: ops, reason: buildReason(result, pick.type) });
      }
    } else if (bestDC.prob >= HEDGE_THRESHOLD) {
      // dc_home via the ≥80% hedge route: require the home team itself to be
      // the main driver (≥45%), not the draw probability propping it up.
      const dcHomePropped = bestDC.type === 'dc_home' && p.homeWin < MIN_HOME_WIN_FOR_DC_HEDGE;
      if (bestDC.type === 'dc_home' && (homeSideUnsafe || dcHomePropped)) {
        const why = dcHomePropped
          ? `homeWin ${(p.homeWin*100).toFixed(0)}% below ${MIN_HOME_WIN_FOR_DC_HEDGE*100}% — pick propped by draw`
          : `awayWin ${(p.awayWin*100).toFixed(0)}%, eloGap ${eloGap}`;
        logSkip(matchLabel, `DC hedge 1X vetoed (${why})`);
      } else {
        hedges.push({ fixture, result, bet: bestDC, overProbs: ops, reason: buildReason(result, bestDC.type) });
      }
    }

    // ── OVERS (evaluated independently for every match) ───────────────────────
    // Evenly-matched fixtures (small Elo gap) historically go under more often
    // — big-six derbies, Ligue 1 mid-table clashes. Require a higher bar there.
    const isEvenMatch = Math.abs(eloGap) < EVEN_MATCH_ELO_GAP;
    const overThresh  = isEvenMatch ? OVER_THRESHOLD_EVEN : OVER_THRESHOLD;
    const xgTotal     = xg.home + xg.away;

    // Each Over line must clear BOTH the probability threshold AND the xG floor.
    const passOver = (prob, xgFloor) => prob >= overThresh && xgTotal >= xgFloor;

    let bestOver = null;
    if      (passOver(ops.over35, OVER_XG_FLOOR.over35)) bestOver = { line: 'OVER 3.5', prob: ops.over35 };
    else if (passOver(ops.over25, OVER_XG_FLOOR.over25)) bestOver = { line: 'OVER 2.5', prob: ops.over25 };
    else if (passOver(ops.over15, OVER_XG_FLOOR.over15)) bestOver = { line: 'OVER 1.5', prob: ops.over15 };

    if (bestOver) {
      overs.push({ fixture, result, bet: bestOver, overProbs: ops, reason: buildOverReason(result, ops) });
    } else {
      // Log when a probability-qualified Over was rejected by a secondary guard
      if (ops.over25 >= OVER_THRESHOLD && xgTotal < OVER_XG_FLOOR.over25) {
        logSkip(matchLabel, `OVER 2.5 ${(ops.over25*100).toFixed(0)}% vetoed — xG total ${xgTotal.toFixed(2)} below floor ${OVER_XG_FLOOR.over25}`);
      } else if (isEvenMatch && ops.over25 >= OVER_THRESHOLD && ops.over25 < OVER_THRESHOLD_EVEN) {
        logSkip(matchLabel, `OVER 2.5 ${(ops.over25*100).toFixed(0)}% vetoed — even match (eloGap ${eloGap})`);
      }
    }
  }

  return { fixtures, highConfidence, hedges, overs, analyzedCount: results.length, targetDate: date };
}

module.exports = { generateDailySlip };
