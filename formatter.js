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

function restLabel(days, factor) {
  if (days === null) return 'Unknown';
  if (factor <= 0.91) return `${days}d ⚠️ Fatigued`;
  if (factor <= 0.95) return `${days}d 😓 Tired`;
  if (factor <= 0.97) return `${days}d 😐 Slight fatigue`;
  if (factor >= 1.00 && days <= 10) return `${days}d ✅ Well rested`;
  if (factor < 1.00) return `${days}d 🟡 Slight rust`;
  return `${days}d`;
}

function formatPrediction(data) {
  if (data.error) return `❌ ${data.error}`;

  const { homeTeam, awayTeam, homeStats, awayStats, prediction, odds, valueAnalysis, homeInjuryFactor, awayInjuryFactor, h2h, elo, rest } = data;
  const { probabilities, expectedGoals, mostLikely } = prediction;

  const lines = [];

  lines.push(`⚽ <b>${homeTeam} vs ${awayTeam}</b>`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  // Injury report
  const hasInjuries = (homeInjuryFactor?.found?.length || homeInjuryFactor?.unknown?.length ||
                       awayInjuryFactor?.found?.length || awayInjuryFactor?.unknown?.length);
  if (hasInjuries) {
    lines.push(`\n🤕 <b>Injury Adjustments</b>`);
    if (homeInjuryFactor) {
      const names = [...(homeInjuryFactor.found.map(p => p.name)), ...(homeInjuryFactor.unknown)].join(', ');
      lines.push(`🏠 ${homeTeam} missing: ${names}`);
      lines.push(`   → Attack ▼${pct(homeInjuryFactor.totalAttackImpact)}  Defence ▲${pct(homeInjuryFactor.totalDefenceImpact)}`);
    }
    if (awayInjuryFactor) {
      const names = [...(awayInjuryFactor.found.map(p => p.name)), ...(awayInjuryFactor.unknown)].join(', ');
      lines.push(`✈️  ${awayTeam} missing: ${names}`);
      lines.push(`   → Attack ▼${pct(awayInjuryFactor.totalAttackImpact)}  Defence ▲${pct(awayInjuryFactor.totalDefenceImpact)}`);
    }
  }

  // Elo ratings
  if (elo) {
    lines.push(`\n⚡ <b>Elo Ratings</b>`);
    lines.push(`🏠 ${homeTeam}: ${elo.home} <i>(${elo.homeTier})</i>`);
    lines.push(`✈️  ${awayTeam}: ${elo.away} <i>(${elo.awayTier})</i>`);
  }

  // Rest days
  if (rest) {
    lines.push(`\n😴 <b>Rest &amp; Fatigue</b>`);
    lines.push(`🏠 ${homeTeam}: ${restLabel(rest.homeDays, rest.homeRestFactor)}`);
    lines.push(`✈️  ${awayTeam}: ${restLabel(rest.awayDays, rest.awayRestFactor)}`);
  }

  // H2H
  if (h2h && h2h.matches >= 3) {
    lines.push(`\n🔁 <b>Head-to-Head (last ${h2h.matches} meetings)</b>`);
    lines.push(`🏠 ${homeTeam} wins: ${pct(h2h.homeWinRate)}  🤝 Draws: ${pct(h2h.drawRate)}  ✈️ ${awayTeam} wins: ${pct(h2h.awayWinRate)}`);
  }

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
  → Full analysis: xG, form, H2H, Poisson model
  → Example: <code>/predict Arsenal vs Chelsea</code>

/predict [Home] vs [Away] --home-out "[players]" --away-out "[players]"
  → With injury overrides
  → Example: <code>/predict Liverpool vs Man City --home-out "Salah" --away-out "Haaland, De Bruyne"</code>

/quick [home_scored] [home_conceded] [away_scored] [away_conceded]
  → Quick prediction with manual stats
  → Example: <code>/quick 1.8 1.1 1.3 1.4</code>

/help → Show this message

<b>How it works:</b>
• True xG data from Understat (no API key needed)
• Dixon-Coles Poisson model with exponential decay
• Home/Away specific stats + Head-to-Head history
• Regression to mean prevents extreme predictions
• Injury impact adjustments for key player absences

<b>Tips:</b>
• Use full team names for best results
• Add injuries for more accurate predictions
• Probabilities above 60% are strong signals
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
