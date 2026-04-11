/**
 * Sports Predictor Telegram Bot
 * Webhook mode — Telegram pushes updates to Railway (no polling needed)
 */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = require('./config');
const { analyzMatch, quickPredict } = require('./predictor');
const { formatPrediction, formatHelp, formatQuickPredict, formatSlip, formatSlipSections, formatSlipWhatsApp } = require('./formatter');
const { parseInjuryList } = require('./injuries');
const { searchTeam, getRawMatches, getTodaysFixtures } = require('./fetcher');
const { generateDailySlip } = require('./slip');
const { sendWhatsApp, isConfigured: whatsAppConfigured } = require('./whatsapp');

// ─── Webhook setup ────────────────────────────────────────────────────────────

const WEBHOOK_URL = 'https://sport-predictor-production.up.railway.app';
const PORT = process.env.PORT || 3000;

// Create bot WITHOUT polling — webhook handles incoming updates
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// Register webhook with Telegram on startup
bot.setWebHook(`${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`)
  .then(() => console.log(`✅ Webhook registered: ${WEBHOOK_URL}/bot${TELEGRAM_TOKEN}`))
  .catch(err => console.error('❌ Webhook registration failed:', err.message));

// ─── Express server — receives Telegram updates ───────────────────────────────

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => res.send('⚽ Sports Predictor Bot — Online'));

// Telegram sends all updates here
app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`⚽ Sports Predictor Bot started on port ${PORT} (webhook mode)`);
});

// ─── Daily slip helper ────────────────────────────────────────────────────────

async function sendDailySlip(chatId, { notifyWhatsApp = false } = {}) {
  try {
    // Check for fixtures first — respond immediately if none found
    const fixtures = await getTodaysFixtures();

    if (!fixtures.length) {
      const msg = `⚽ <b>No matches found today.</b>\nNo fixtures scheduled in covered leagues. Check back tomorrow!`;
      await bot.sendMessage(chatId, msg, { parse_mode: 'HTML' });
      if (notifyWhatsApp && whatsAppConfigured()) {
        await sendWhatsApp('⚽ No matches found today. Check back tomorrow!');
      }
      return;
    }

    // Fixtures found — show loading message then analyse
    const statusMsg = await bot.sendMessage(chatId,
      `⏳ <b>Generating today's betting slip...</b>\nFound <b>${fixtures.length}</b> fixture(s). Analysing each match.\nThis takes ~3 minutes due to API rate limits. I'll update this message when done.`,
      { parse_mode: 'HTML' }
    );

    const slip = await generateDailySlip();
    const sections = formatSlipSections(slip);

    // Send slip as multiple messages (one per section) to stay under Telegram's 4096 char limit.
    // Edit the loading message with section[0], then send remaining sections fresh.
    try {
      await bot.editMessageText(sections[0], {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML',
      });
    } catch (editErr) {
      console.warn('[slip] editMessageText failed, sending new message:', editErr.message);
      await bot.sendMessage(chatId, sections[0], { parse_mode: 'HTML' });
    }

    for (let i = 1; i < sections.length; i++) {
      await bot.sendMessage(chatId, sections[i], { parse_mode: 'HTML' });
    }

    if (notifyWhatsApp && whatsAppConfigured()) {
      const waText = formatSlipWhatsApp(slip);
      await sendWhatsApp(waText);
      console.log('[slip] WhatsApp copy sent.');
    }
  } catch (err) {
    console.error('[slip] Fatal error:', err);
    bot.sendMessage(chatId, '❌ Failed to generate slip. Please try again.');
  }
}

// ─── /start & /help ──────────────────────────────────────────────────────────

bot.onText(/\/(start|help)/, (msg) => {
  bot.sendMessage(msg.chat.id, formatHelp(), { parse_mode: 'HTML' });
});

// ─── /debug [Team] ───────────────────────────────────────────────────────────

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

  const homeOutMatch = input.match(/--home-out\s+"([^"]+)"|--home-out\s+([\w\s,]+?)(?=\s+--|$)/i);
  const awayOutMatch = input.match(/--away-out\s+"([^"]+)"|--away-out\s+([\w\s,]+?)(?=\s+--|$)/i);

  const homeInjuries = homeOutMatch ? parseInjuryList(homeOutMatch[1] || homeOutMatch[2]) : [];
  const awayInjuries = awayOutMatch ? parseInjuryList(awayOutMatch[1] || awayOutMatch[2]) : [];

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
      'Example: <code>/predict Liverpool vs Man City</code>\n' +
      'With injuries: <code>/predict Arsenal vs Chelsea --home-out "Saka" --away-out "Palmer"</code>',
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

// ─── /quick ──────────────────────────────────────────────────────────────────

bot.onText(/\/quick (.+)/, (msg, match) => {
  const parts = match[1].trim().split(/\s+/);

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
    '❌ Usage:\n/quick 1.8 1.1 1.3 1.4\n/quick Arsenal vs Chelsea 1.8 1.1 1.3 1.4'
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

cron.schedule('0 5 * * *', async () => {
  console.log('[cron] Sending daily slip to Telegram + WhatsApp...');
  if (TELEGRAM_CHAT_ID) {
    await sendDailySlip(TELEGRAM_CHAT_ID, { notifyWhatsApp: true });
  } else {
    console.warn('[cron] TELEGRAM_CHAT_ID not set — skipping auto slip.');
  }
}, { timezone: 'UTC' });

console.log('📅 Daily slip scheduled for 08:00 EAT (05:00 UTC) every day.');

// ─── Graceful shutdown ────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  process.exit(0);
});
