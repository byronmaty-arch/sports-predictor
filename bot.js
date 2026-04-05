/**
 * Sports Predictor Telegram Bot
 * Predicts football match outcomes using Poisson distribution + live data
 */

const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = require('./config');
const { analyzMatch, quickPredict } = require('./predictor');
const { formatPrediction, formatHelp, formatQuickPredict, formatSlip, formatSlipWhatsApp } = require('./formatter');
const { parseInjuryList } = require('./injuries');
const { searchTeam, getRawMatches } = require('./fetcher');
const { generateDailySlip } = require('./slip');
const { sendWhatsApp, isConfigured: whatsAppConfigured } = require('./whatsapp');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('⚽ Sports Predictor Bot started...');

// ─── Daily slip helper ────────────────────────────────────────────────────────

async function sendDailySlip(chatId, { notifyWhatsApp = false } = {}) {
  const statusMsg = await bot.sendMessage(chatId,
    `⏳ <b>Generating today's betting slip...</b>\nFetching fixtures and analysing each match.\nThis takes ~3 minutes due to API rate limits. I'll update this message when done.`,
    { parse_mode: 'HTML' }
  );

  try {
    const slip = await generateDailySlip();

    // Send to Telegram
    const text = formatSlip(slip);
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'HTML',
    });

    // Send to WhatsApp if enabled and this is an auto/scheduled slip
    if (notifyWhatsApp && whatsAppConfigured()) {
      const waText = formatSlipWhatsApp(slip);
      await sendWhatsApp(waText);
      console.log('[slip] WhatsApp copy sent.');
    }
  } catch (err) {
    console.error('[slip] Fatal error:', err);
    bot.editMessageText('❌ Failed to generate slip. Check logs.', {
      chat_id: chatId,
      message_id: statusMsg.message_id,
    });
  }
}

// ─── /start & /help ──────────────────────────────────────────────────────────

bot.onText(/\/(start|help)/, (msg) => {
  bot.sendMessage(msg.chat.id, formatHelp(), { parse_mode: 'HTML' });
});

// ─── /debug [Team] — shows raw API matches and competition codes ──────────────

bot.onText(/\/debug (.+)/i, async (msg, match) => {
  const teamName = match[1].trim();
  const teamData = await searchTeam(teamName);
  if (!teamData) {
    return bot.sendMessage(msg.chat.id, `❌ Team not found: ${teamName}`);
  }
  const raw = await getRawMatches(teamData.id, 15);
  if (!raw.length) {
    return bot.sendMessage(msg.chat.id, `❌ No matches returned from API for ${teamData.name}`);
  }
  const lines = [`🔍 <b>${teamData.name}</b> — last ${raw.length} API matches:\n`];
  for (const m of raw) {
    const tick = m.inLeagueFilter ? '✅' : '❌';
    lines.push(`${tick} ${m.date} | ${m.competition}`);
    lines.push(`   ${m.home} ${m.score} ${m.away}`);
  }
  bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
});

// ─── /slip — generate today's betting slip on demand ─────────────────────────

bot.onText(/\/slip/, async (msg) => {
  await sendDailySlip(msg.chat.id);
});

// ─── /predict [Home] vs [Away] ────────────────────────────────────────────────

bot.onText(/\/predict (.+)/i, async (msg, match) => {
  let input = match[1].trim();

  // Extract --home-out and --away-out flags (with or without quotes)
  const homeOutMatch = input.match(/--home-out\s+"([^"]+)"|--home-out\s+([\w\s,]+?)(?=\s+--|$)/i);
  const awayOutMatch = input.match(/--away-out\s+"([^"]+)"|--away-out\s+([\w\s,]+?)(?=\s+--|$)/i);

  const homeInjuries = homeOutMatch ? parseInjuryList(homeOutMatch[1] || homeOutMatch[2]) : [];
  const awayInjuries = awayOutMatch ? parseInjuryList(awayOutMatch[1] || awayOutMatch[2]) : [];

  // Strip flags to get clean team input
  const cleanInput = input
    .replace(/--home-out\s+"[^"]+"/gi, '')
    .replace(/--away-out\s+"[^"]+"/gi, '')
    .replace(/--home-out\s+[\w\s,]+/gi, '')
    .replace(/--away-out\s+[\w\s,]+/gi, '')
    .trim();

  const parts = cleanInput.split(/\s+vs\s+/i);

  if (parts.length !== 2) {
    return bot.sendMessage(msg.chat.id,
      '❌ Format: /predict &lt;Home&gt; vs &lt;Away&gt;\n' +
      'With injuries: /predict Arsenal vs Chelsea --home-out "Saka" --away-out "Palmer, Jackson"\n\n' +
      'Example: <code>/predict Liverpool vs Man City --home-out "Salah" --away-out "Haaland"</code>',
      { parse_mode: 'HTML' }
    );
  }

  const [homeTeam, awayTeam] = parts.map(s => s.trim());
  const injuryNote = [
    homeInjuries.length ? `🏠 Out: ${homeInjuries.join(', ')}` : '',
    awayInjuries.length ? `✈️ Out: ${awayInjuries.join(', ')}` : '',
  ].filter(Boolean).join(' | ');

  const loadingMsg = await bot.sendMessage(msg.chat.id,
    `⏳ Analyzing <b>${homeTeam} vs ${awayTeam}</b>${injuryNote ? `\n🤕 ${injuryNote}` : ''}...`,
    { parse_mode: 'HTML' }
  );

  try {
    const result = await analyzMatch(homeTeam, awayTeam, { homeInjuries, awayInjuries });
    const text = formatPrediction(result);
    await bot.editMessageText(text, {
      chat_id: msg.chat.id,
      message_id: loadingMsg.message_id,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('Prediction error:', err);
    bot.editMessageText('❌ An error occurred. Please try again.', {
      chat_id: msg.chat.id,
      message_id: loadingMsg.message_id,
    });
  }
});

// ─── /quick [home_scored] [home_conceded] [away_scored] [away_conceded] ───────
// For when you know the stats but don't have an API key set up yet

bot.onText(/\/quick (.+)/, (msg, match) => {
  const parts = match[1].trim().split(/\s+/);

  // Mode 1: 4 numbers (stats only)
  if (parts.length === 4) {
    const [hs, hc, as_, ac] = parts.map(Number);
    if ([hs, hc, as_, ac].some(isNaN)) {
      return bot.sendMessage(msg.chat.id,
        '❌ Usage: /quick [home_scored] [home_conceded] [away_scored] [away_conceded]\n' +
        'Example: /quick 1.8 1.1 1.3 1.4'
      );
    }
    const prediction = quickPredict(hs, hc, as_, ac);
    bot.sendMessage(msg.chat.id, formatQuickPredict('Home', 'Away', prediction), { parse_mode: 'HTML' });
    return;
  }

  // Mode 2: "TeamA vs TeamB" + 4 numbers
  const vsMatch = match[1].match(/^(.+?)\s+vs\s+(.+?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/i);
  if (vsMatch) {
    const homeTeam = vsMatch[1].trim();
    const awayTeam = vsMatch[2].trim();
    const [hs, hc, as_, ac] = [vsMatch[3], vsMatch[4], vsMatch[5], vsMatch[6]].map(Number);
    const prediction = quickPredict(hs, hc, as_, ac);
    bot.sendMessage(msg.chat.id, formatQuickPredict(homeTeam, awayTeam, prediction), { parse_mode: 'HTML' });
    return;
  }

  bot.sendMessage(msg.chat.id,
    '❌ Usage:\n' +
    '/quick 1.8 1.1 1.3 1.4\n' +
    '/quick Arsenal vs Chelsea 1.8 1.1 1.3 1.4'
  );
});

// ─── Natural language: "Arsenal vs Chelsea" ──────────────────────────────────

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const vsMatch = msg.text.match(/^(.+?)\s+vs\s+(.+)$/i);
  if (!vsMatch) return;

  const [homeTeam, awayTeam] = [vsMatch[1].trim(), vsMatch[2].trim()];
  if (homeTeam.length < 2 || awayTeam.length < 2) return;

  const loadingMsg = await bot.sendMessage(msg.chat.id,
    `⏳ Analyzing <b>${homeTeam} vs ${awayTeam}</b>...`, { parse_mode: 'HTML' }
  );

  try {
    const result = await analyzMatch(homeTeam, awayTeam);
    const text = formatPrediction(result);
    await bot.editMessageText(text, {
      chat_id: msg.chat.id,
      message_id: loadingMsg.message_id,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('Prediction error:', err);
    bot.editMessageText('❌ An error occurred. Please try again.', {
      chat_id: msg.chat.id,
      message_id: loadingMsg.message_id,
    });
  }
});

// ─── Daily slip — auto-send at 08:00 EAT (05:00 UTC) every day ───────────────
// Cron format: minute hour day month weekday
// '0 5 * * *' = every day at 05:00 UTC = 08:00 Uganda time (EAT = UTC+3)

cron.schedule('0 5 * * *', async () => {
  console.log('[cron] Sending daily slip to Telegram + WhatsApp...');
  if (TELEGRAM_CHAT_ID) {
    await sendDailySlip(TELEGRAM_CHAT_ID, { notifyWhatsApp: true });
  } else {
    console.warn('[cron] TELEGRAM_CHAT_ID not set — skipping auto slip.');
  }
}, { timezone: 'UTC' });

console.log('📅 Daily slip scheduled for 08:00 EAT (05:00 UTC) every day.');

// ─── Error handling ───────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});
