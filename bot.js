/**
 * Sports Predictor Telegram Bot
 * Predicts football match outcomes using Poisson distribution + live data
 */

const TelegramBot = require('node-telegram-bot-api');
const { TELEGRAM_TOKEN } = require('./config');
const { analyzMatch, quickPredict } = require('./predictor');
const { formatPrediction, formatHelp, formatQuickPredict } = require('./formatter');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('⚽ Sports Predictor Bot started...');

// ─── /start & /help ──────────────────────────────────────────────────────────

bot.onText(/\/(start|help)/, (msg) => {
  bot.sendMessage(msg.chat.id, formatHelp(), { parse_mode: 'HTML' });
});

// ─── /predict [Home] vs [Away] ────────────────────────────────────────────────

bot.onText(/\/predict (.+)/i, async (msg, match) => {
  const input = match[1].trim();
  const parts = input.split(/\s+vs\s+/i);

  if (parts.length !== 2) {
    return bot.sendMessage(msg.chat.id,
      '❌ Format: /predict <Home Team> vs <Away Team>\nExample: /predict Arsenal vs Chelsea'
    );
  }

  const [homeTeam, awayTeam] = parts.map(s => s.trim());
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

// ─── Error handling ───────────────────────────────────────────────────────────

bot.on('polling_error', (err) => {
  console.error('Polling error:', err.message);
});

process.on('SIGINT', () => {
  console.log('Shutting down bot...');
  bot.stopPolling();
  process.exit(0);
});
