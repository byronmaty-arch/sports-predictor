/**
 * Formats prediction results into Telegram messages
 */

function pct(n) { return `${(n * 100).toFixed(1)}%`; }
function bar(prob, len = 10) {
  const filled = Math.round(prob * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}
function formEmoji(result) {
  return result === 'W' ? '🟢' : result === 'D' ? '🟡' : '🔴';
}

function formatForm(formStr) {
  if (!formStr) return 'N/A';
  return formStr.split('').map(formEmoji).join('');
}

function formatPrediction(data) {
  if (data.error) return `❌ ${data.error}`;

  const { homeTeam, awayTeam, homeStats, awayStats, prediction, odds, valueAnalysis } = data;
  const { probabilities, expectedGoals, mostLikely } = prediction;

  const lines = [];

  lines.push(`⚽ <b>${homeTeam} vs ${awayTeam}</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  // Form
  lines.push(`\n📊 <b>Recent Form (last 5)</b>`);
  lines.push(`🏠 ${homeTeam}: ${formatForm(homeStats.form)}`);
  lines.push(`✈️  ${awayTeam}: ${formatForm(awayStats.form)}`);

  // Key stats
  lines.push(`\n📈 <b>Stats (last ${homeStats.played} matches)</b>`);
  lines.push(`          Goals/Game  Conceded/G`);
  lines.push(`${homeTeam.padEnd(14)} ${homeStats.avgScored.toFixed(2).padStart(5)}       ${homeStats.avgConceded.toFixed(2)}`);
  lines.push(`${awayTeam.padEnd(14)} ${awayStats.avgScored.toFixed(2).padStart(5)}       ${awayStats.avgConceded.toFixed(2)}`);

  // Prediction
  lines.push(`\n🎯 <b>Prediction</b>`);
  lines.push(`Expected: ${homeTeam} ${expectedGoals.home.toFixed(2)} – ${expectedGoals.away.toFixed(2)} ${awayTeam}`);
  lines.push(`Most likely score: <b>${mostLikely}</b>`);

  lines.push(`\n📉 <b>Outcome Probabilities</b>`);
  lines.push(`🏠 Home Win  ${bar(probabilities.homeWin)} ${pct(probabilities.homeWin)}`);
  lines.push(`🤝 Draw      ${bar(probabilities.draw)} ${pct(probabilities.draw)}`);
  lines.push(`✈️  Away Win  ${bar(probabilities.awayWin)} ${pct(probabilities.awayWin)}`);

  // Odds & value
  if (odds) {
    lines.push(`\n💰 <b>Bookmaker Odds (avg)</b>`);
    lines.push(`Home: ${odds.home?.toFixed(2) || 'N/A'}  |  Draw: ${odds.draw?.toFixed(2) || 'N/A'}  |  Away: ${odds.away?.toFixed(2) || 'N/A'}`);
    lines.push(`(${odds.bookmakerCount} bookmakers)`);

    if (valueAnalysis) {
      const values = [
        { label: `🏠 ${homeTeam} Win`, v: valueAnalysis.homeValue },
        { label: '🤝 Draw', v: valueAnalysis.drawValue },
        { label: `✈️  ${awayTeam} Win`, v: valueAnalysis.awayValue },
      ].filter(x => x.v && x.v.hasValue);

      if (values.length) {
        lines.push(`\n💡 <b>Value Bets Found!</b>`);
        for (const { label, v } of values) {
          lines.push(`${label}: model ${pct(v.impliedProb + v.edge)} vs bookie ${pct(v.impliedProb)} (+${pct(v.edge)} edge)`);
        }
      } else {
        lines.push(`\n💡 No significant value found vs bookmaker odds.`);
      }
    }
  }

  // Recommendation
  const best = getBestBet(probabilities, odds);
  if (best) {
    lines.push(`\n🏆 <b>Best Bet: ${best.label}</b>`);
    lines.push(`Confidence: ${pct(best.prob)} probability`);
    if (best.odds) lines.push(`Odds: ${best.odds.toFixed(2)}`);
  }

  lines.push(`\n━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`⚠️ <i>For informational purposes only. Bet responsibly.</i>`);

  return lines.join('\n');
}

function getBestBet(probs, odds) {
  const outcomes = [
    { label: 'Home Win', prob: probs.homeWin, odds: odds?.home },
    { label: 'Draw', prob: probs.draw, odds: odds?.draw },
    { label: 'Away Win', prob: probs.awayWin, odds: odds?.away },
  ];
  // Pick highest probability outcome if >45%
  const best = outcomes.sort((a, b) => b.prob - a.prob)[0];
  if (best.prob > 0.45) return best;
  return null;
}

function formatHelp() {
  return `🤖 <b>Sports Predictor Bot</b>

<b>Commands:</b>
/predict [Home] vs [Away]
  → Full match analysis & prediction
  → Example: <code>/predict Arsenal vs Chelsea</code>

/quick [home_scored] [home_conceded] [away_scored] [away_conceded]
  → Quick prediction with manual stats
  → Example: <code>/quick 1.8 1.1 1.3 1.4</code>

/help → Show this message

<b>How it works:</b>
• Fetches recent form & stats via football-data.org
• Applies Poisson distribution model (industry standard)
• Compares against bookmaker odds to find value
• Works for any league with available data

<b>Tips:</b>
• Use full team names for best results
• Probabilities above 60% are considered strong signals
• Value bets = where our model finds edge vs bookmakers`;
}

function formatQuickPredict(homeTeam, awayTeam, prediction) {
  const { probabilities, expectedGoals, mostLikely } = prediction;
  const lines = [];

  lines.push(`⚽ <b>${homeTeam} vs ${awayTeam}</b> (Quick Mode)`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`Expected: ${expectedGoals.home.toFixed(2)} – ${expectedGoals.away.toFixed(2)}`);
  lines.push(`Most likely score: <b>${mostLikely}</b>`);
  lines.push(``);
  lines.push(`🏠 Home Win  ${bar(probabilities.homeWin)} ${pct(probabilities.homeWin)}`);
  lines.push(`🤝 Draw      ${bar(probabilities.draw)} ${pct(probabilities.draw)}`);
  lines.push(`✈️  Away Win  ${bar(probabilities.awayWin)} ${pct(probabilities.awayWin)}`);
  lines.push(`\n⚠️ <i>For informational purposes only. Bet responsibly.</i>`);

  return lines.join('\n');
}

module.exports = { formatPrediction, formatHelp, formatQuickPredict };
