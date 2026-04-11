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
/slip
  → Auto-fetch today's fixtures &amp; generate daily betting slip
  → Picks: High Confidence (≥65%), Hedges (≥80% DC), Overs (≥75%)
  → Also sent automatically every day at 08:00 EAT

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

// ─── Daily Betting Slip ───────────────────────────────────────────────────────

function formatSlip(slip) {
  const lines = [];
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Africa/Kampala',
  });

  lines.push(`📋 <b>DAILY BETTING SLIP</b>`);
  lines.push(`📅 ${dateStr}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  if (slip.noFixtures) {
    lines.push(`\n⚠️ No fixtures found today in covered leagues.`);
    lines.push(`Use /predict [Home] vs [Away] for manual predictions.`);
    return lines.join('\n');
  }

  lines.push(`⚽ Analysed <b>${slip.analyzedCount}</b> fixture(s)`);

  if (!slip.highConfidence.length && !slip.hedges.length && !slip.overs.length) {
    lines.push(`\n⚠️ No picks meet confidence thresholds today.`);
    lines.push(`All matches are too close to call — skip today or use /predict for details.`);
    return lines.join('\n');
  }

  let n = 1;

  // ── HIGH CONFIDENCE picks ─────────────────────────────────────────────────
  if (slip.highConfidence.length) {
    lines.push(`\n🟢 <b>HIGH CONFIDENCE (≥65%)</b>`);
    for (const pick of slip.highConfidence) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      lines.push(``);
      lines.push(`<b>${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}</b>`);
      lines.push(`   ✅ <b>${pick.bet.label}</b>  —  ${pct(pick.bet.prob)}`);
      lines.push(`   🏟 ${pick.fixture.competition}  ·  ⏰ ${ko} EAT`);
      lines.push(`   💡 ${pick.reason}`);
      lines.push(`   📊 xG ${pick.result.prediction.expectedGoals.home.toFixed(1)}–${pick.result.prediction.expectedGoals.away.toFixed(1)}  ·  Likely: ${pick.result.prediction.mostLikely}`);
      n++;
    }
  }

  // ── HEDGE picks ───────────────────────────────────────────────────────────
  if (slip.hedges.length) {
    lines.push(`\n🛡️ <b>HEDGE — Double Chance (≥80%)</b>`);
    for (const pick of slip.hedges) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      lines.push(``);
      lines.push(`<b>${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}</b>`);
      lines.push(`   🛡️ <b>${pick.bet.label}</b>  —  ${pct(pick.bet.prob)}`);
      lines.push(`   🏟 ${pick.fixture.competition}  ·  ⏰ ${ko} EAT`);
      lines.push(`   💡 ${pick.reason}`);
      lines.push(`   📊 xG ${pick.result.prediction.expectedGoals.home.toFixed(1)}–${pick.result.prediction.expectedGoals.away.toFixed(1)}`);
      n++;
    }
  }

  // ── OVERS picks ───────────────────────────────────────────────────────────
  if (slip.overs.length) {
    lines.push(`\n⚽ <b>GOALS — Over/Under (≥75%)</b>`);
    for (const pick of slip.overs) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      lines.push(``);
      lines.push(`<b>${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}</b>`);
      lines.push(`   ⚽ <b>${pick.bet.line}</b>  —  ${pct(pick.bet.prob)}`);
      lines.push(`   🏟 ${pick.fixture.competition}  ·  ⏰ ${ko} EAT`);
      lines.push(`   💡 ${pick.reason}`);
      lines.push(`   📊 O1.5: ${pct(pick.overProbs.over15)}  O2.5: ${pct(pick.overProbs.over25)}  O3.5: ${pct(pick.overProbs.over35)}  BTTS: ${pct(pick.overProbs.btts)}`);
      n++;
    }
  }

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📌 <b>${n - 1} pick(s) today</b>`);
  lines.push(`⚠️ <i>Model predictions only. Bet responsibly.</i>`);

  return lines.join('\n');
}

// Plain-text slip for WhatsApp (no HTML — uses *bold* WhatsApp markdown)
function formatSlipWhatsApp(slip) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Africa/Kampala',
  });

  const lines = [];
  lines.push(`📋 *DAILY BETTING SLIP*`);
  lines.push(`📅 ${dateStr}`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  if (slip.noFixtures) {
    lines.push(`\n⚠️ No fixtures found today in covered leagues.`);
    return lines.join('\n');
  }

  lines.push(`⚽ Analysed *${slip.analyzedCount}* fixture(s)`);

  if (!slip.highConfidence.length && !slip.hedges.length && !slip.overs.length) {
    lines.push(`\n⚠️ No picks meet confidence thresholds today.`);
    return lines.join('\n');
  }

  let n = 1;

  if (slip.highConfidence.length) {
    lines.push(`\n🟢 *HIGH CONFIDENCE (≥65%)*`);
    for (const pick of slip.highConfidence) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      lines.push(``);
      lines.push(`*${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}*`);
      lines.push(`   ✅ ${pick.bet.label} — ${pct(pick.bet.prob)}`);
      lines.push(`   🏟 ${pick.fixture.competition} · ⏰ ${ko} EAT`);
      lines.push(`   💡 ${pick.reason}`);
      lines.push(`   📊 xG ${pick.result.prediction.expectedGoals.home.toFixed(1)}–${pick.result.prediction.expectedGoals.away.toFixed(1)} · Score: ${pick.result.prediction.mostLikely}`);
      n++;
    }
  }

  if (slip.hedges.length) {
    lines.push(`\n🛡️ *HEDGE — Double Chance (≥80%)*`);
    for (const pick of slip.hedges) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      lines.push(``);
      lines.push(`*${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}*`);
      lines.push(`   🛡️ ${pick.bet.label} — ${pct(pick.bet.prob)}`);
      lines.push(`   🏟 ${pick.fixture.competition} · ⏰ ${ko} EAT`);
      lines.push(`   💡 ${pick.reason}`);
      n++;
    }
  }

  if (slip.overs.length) {
    lines.push(`\n⚽ *GOALS — Over/Under (≥75%)*`);
    for (const pick of slip.overs) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      lines.push(``);
      lines.push(`*${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}*`);
      lines.push(`   ⚽ ${pick.bet.line} — ${pct(pick.bet.prob)}`);
      lines.push(`   🏟 ${pick.fixture.competition} · ⏰ ${ko} EAT`);
      lines.push(`   💡 ${pick.reason}`);
      lines.push(`   📊 O1.5: ${pct(pick.overProbs.over15)}  O2.5: ${pct(pick.overProbs.over25)}  O3.5: ${pct(pick.overProbs.over35)}`);
      n++;
    }
  }

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`📌 *${n - 1} pick(s) today*`);
  lines.push(`⚠️ _Model predictions only. Bet responsibly._`);

  return lines.join('\n');
}

function kickoffEAT(utcDate) {
  return new Date(utcDate).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  });
}

// Splits the slip into 3 separate messages to stay under Telegram's 4096 char limit:
//   [0] Header + High Confidence picks
//   [1] Hedge / Double Chance picks  (omitted if empty)
//   [2] Goals / Over picks + footer  (omitted if empty)
function formatSlipSections(slip) {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    timeZone: 'Africa/Kampala',
  });

  const headerLines = [
    `📋 <b>DAILY BETTING SLIP</b>`,
    `📅 ${dateStr}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `⚽ Analysed <b>${slip.analyzedCount}</b> fixture(s)`,
  ];

  if (slip.noFixtures) {
    return [headerLines.join('\n') + '\n\n⚠️ No fixtures found today in covered leagues.\nUse /predict [Home] vs [Away] for manual predictions.'];
  }
  if (!slip.highConfidence.length && !slip.hedges.length && !slip.overs.length) {
    return [headerLines.join('\n') + '\n\n⚠️ No picks meet confidence thresholds today.\nAll matches are too close to call — skip today or use /predict for details.'];
  }

  const sections = [];
  let n = 1;

  // ── Section 1: Header + High Confidence ──────────────────────────────────────
  const s1 = [...headerLines];
  if (slip.highConfidence.length) {
    s1.push(`\n🟢 <b>HIGH CONFIDENCE (≥70%)</b>`);
    for (const pick of slip.highConfidence) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      s1.push(``);
      s1.push(`<b>${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}</b>`);
      s1.push(`   ✅ <b>${pick.bet.label}</b>  —  ${pct(pick.bet.prob)}`);
      s1.push(`   🏟 ${pick.fixture.competition}  ·  ⏰ ${ko} EAT`);
      s1.push(`   💡 ${pick.reason}`);
      s1.push(`   📊 xG ${pick.result.prediction.expectedGoals.home.toFixed(1)}–${pick.result.prediction.expectedGoals.away.toFixed(1)}  ·  Likely: ${pick.result.prediction.mostLikely}`);
      n++;
    }
  } else {
    s1.push(`\n⚠️ No high-confidence outright picks today.`);
  }
  sections.push(s1.join('\n'));

  // ── Section 2: Hedges ─────────────────────────────────────────────────────────
  if (slip.hedges.length) {
    const s2 = [`🛡️ <b>HEDGE — Double Chance</b>`];
    for (const pick of slip.hedges) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      s2.push(``);
      s2.push(`<b>${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}</b>`);
      s2.push(`   🛡️ <b>${pick.bet.label}</b>  —  ${pct(pick.bet.prob)}`);
      s2.push(`   🏟 ${pick.fixture.competition}  ·  ⏰ ${ko} EAT`);
      s2.push(`   💡 ${pick.reason}`);
      s2.push(`   📊 xG ${pick.result.prediction.expectedGoals.home.toFixed(1)}–${pick.result.prediction.expectedGoals.away.toFixed(1)}`);
      n++;
    }
    sections.push(s2.join('\n'));
  }

  // ── Section 3: Overs + footer ─────────────────────────────────────────────────
  if (slip.overs.length) {
    const s3 = [`⚽ <b>GOALS — Over/Under (≥75%)</b>`];
    for (const pick of slip.overs) {
      const ko = kickoffEAT(pick.fixture.kickoff);
      s3.push(``);
      s3.push(`<b>${n}. ${pick.result.homeTeam} vs ${pick.result.awayTeam}</b>`);
      s3.push(`   ⚽ <b>${pick.bet.line}</b>  —  ${pct(pick.bet.prob)}`);
      s3.push(`   🏟 ${pick.fixture.competition}  ·  ⏰ ${ko} EAT`);
      s3.push(`   💡 ${pick.reason}`);
      s3.push(`   📊 O1.5: ${pct(pick.overProbs.over15)}  O2.5: ${pct(pick.overProbs.over25)}  O3.5: ${pct(pick.overProbs.over35)}  BTTS: ${pct(pick.overProbs.btts)}`);
      n++;
    }
    s3.push(``);
    s3.push(`━━━━━━━━━━━━━━━━━━━━`);
    s3.push(`📌 <b>${n - 1} pick(s) today</b>`);
    s3.push(`⚠️ <i>Model predictions only. Bet responsibly.</i>`);
    sections.push(s3.join('\n'));
  } else {
    // No overs section — append footer to last section
    sections[sections.length - 1] +=
      `\n\n━━━━━━━━━━━━━━━━━━━━\n📌 <b>${n - 1} pick(s) today</b>\n⚠️ <i>Model predictions only. Bet responsibly.</i>`;
  }

  return sections;
}

module.exports = { formatPrediction, formatHelp, formatQuickPredict, formatSlip, formatSlipSections, formatSlipWhatsApp };
