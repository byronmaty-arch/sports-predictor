/**
 * Poisson Distribution - Industry standard for football score prediction
 * Based on the Dixon-Coles model principles
 */

// Poisson probability: P(X=k) = (lambda^k * e^-lambda) / k!
function poissonProb(lambda, k) {
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// Dixon-Coles tau correction for low-scoring scorelines
// Captures the real-world negative correlation between goals at 0-0, 1-0, 0-1, 1-1
// rho = -0.1 is the empirically validated value from the original DC paper
function dixonColesTau(h, a, lambdaHome, lambdaAway, rho = -0.1) {
  if (h === 0 && a === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (h === 1 && a === 0) return 1 + lambdaAway * rho;
  if (h === 0 && a === 1) return 1 + lambdaHome * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1; // No correction needed for scorelines > 1-1
}

// Build score probability matrix with full Dixon-Coles correction
function scoreMatrix(lambdaHome, lambdaAway, maxGoals = 8) {
  const matrix = [];
  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const tau = dixonColesTau(h, a, lambdaHome, lambdaAway);
      matrix[h][a] = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a) * tau;
    }
  }
  return matrix;
}

// Extract win/draw/loss probabilities from score matrix
function matchProbabilities(lambdaHome, lambdaAway) {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  let homeWin = 0, draw = 0, awayWin = 0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const p = matrix[h][a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  // Normalize (small rounding from truncating at maxGoals)
  const total = homeWin + draw + awayWin;
  return {
    homeWin: homeWin / total,
    draw: draw / total,
    awayWin: awayWin / total,
  };
}

// Expected goals from team stats
// attackStrength = team's avg goals scored / league avg scored
// defenceWeakness = opponent's avg goals conceded / league avg conceded
function expectedGoals(attackStrength, defenceWeakness, leagueAvg, homeAdvantage = 1.0) {
  return attackStrength * defenceWeakness * leagueAvg * homeAdvantage;
}

// Convert decimal odds to implied probability
function oddsToProb(decimalOdds) {
  return 1 / decimalOdds;
}

// Find value: model prob vs bookmaker implied prob (>5% edge = value)
function findValue(modelProb, bookmakerOdds, threshold = 0.05) {
  if (!bookmakerOdds) return null;
  const impliedProb = oddsToProb(bookmakerOdds);
  const edge = modelProb - impliedProb;
  return { edge, hasValue: edge > threshold, impliedProb };
}

// ─── Regression to the Mean ───────────────────────────────────────────────────
// Blends model probabilities with long-run football base rates.
// Prevents extreme predictions caused by compounding form/xG factors.
//
// Base rates from 10+ seasons of top European league data:
//   Home Win: 45%  |  Draw: 25%  |  Away Win: 30%
//
// Confidence weight (max 0.75) scales with how many matches we have data for.
// We never fully trust the model alone — football is too unpredictable.
//
// Formula: final = (modelProb × weight) + (baseRate × (1 − weight))

const BASE_RATES = { homeWin: 0.45, draw: 0.25, awayWin: 0.30 };
const MAX_MODEL_WEIGHT = 0.75; // Even with perfect data, cap model influence at 75%

function regressToMean(probs, confidence) {
  // Scale confidence (0–1) to model weight (0–MAX_MODEL_WEIGHT)
  const weight = confidence * MAX_MODEL_WEIGHT;

  const regressed = {
    homeWin: (probs.homeWin * weight) + (BASE_RATES.homeWin * (1 - weight)),
    draw:    (probs.draw    * weight) + (BASE_RATES.draw    * (1 - weight)),
    awayWin: (probs.awayWin * weight) + (BASE_RATES.awayWin * (1 - weight)),
  };

  // Re-normalise so they sum to exactly 1.0
  const total = regressed.homeWin + regressed.draw + regressed.awayWin;
  return {
    homeWin: regressed.homeWin / total,
    draw:    regressed.draw    / total,
    awayWin: regressed.awayWin / total,
  };
}

// Predict match from raw stats
// confidence = min(matchesPlayed / 10, 1.0) passed in from computeTeamStats
function predictMatch(homeStats, awayStats, leagueAvg, confidence = 1.0) {
  const HOME_ADVANTAGE = 1.15; // ~15% home boost (football average)

  const lambdaHome = expectedGoals(
    homeStats.attackStrength,
    awayStats.defenceWeakness,
    leagueAvg,
    HOME_ADVANTAGE
  );
  const lambdaAway = expectedGoals(
    awayStats.attackStrength,
    homeStats.defenceWeakness,
    leagueAvg,
    1.0
  );

  const rawProbs = matchProbabilities(lambdaHome, lambdaAway);

  // Apply regression — pulls extreme probabilities toward realistic base rates
  const probs = regressToMean(rawProbs, confidence);

  return {
    expectedGoals: { home: lambdaHome, away: lambdaAway },
    probabilities: probs,
    rawProbabilities: rawProbs,   // Keep raw for transparency
    mostLikely: getMostLikelyScore(lambdaHome, lambdaAway),
  };
}

function getMostLikelyScore(lambdaHome, lambdaAway, maxGoals = 6) {
  let best = { h: 0, a: 0, p: 0 };
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonProb(lambdaHome, h) * poissonProb(lambdaAway, a);
      if (p > best.p) best = { h, a, p };
    }
  }
  return `${best.h}-${best.a}`;
}

// Over/Under goal probabilities derived from the Poisson score matrix
// Returns P(OVER 1.5), P(OVER 2.5), P(OVER 3.5), and Both Teams to Score
function overProbabilities(lambdaHome, lambdaAway) {
  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  let over15 = 0, over25 = 0, over35 = 0, btts = 0;

  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      const p = matrix[h][a];
      const total = h + a;
      if (total > 1) over15 += p;
      if (total > 2) over25 += p;
      if (total > 3) over35 += p;
      if (h > 0 && a > 0) btts += p;
    }
  }

  return { over15, over25, over35, btts };
}

module.exports = { predictMatch, matchProbabilities, findValue, oddsToProb, overProbabilities };
