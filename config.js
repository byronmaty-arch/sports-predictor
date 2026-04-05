module.exports = {
  TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN || '8689840134:AAGrdD3QTbXg8y3UFBdiqQmXEpXq0HuibeY',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '714460753',

  // Get free key at: https://www.football-data.org/client/register
  FOOTBALL_DATA_API_KEY: process.env.FOOTBALL_DATA_API_KEY || 'b739381379d44252acd2c8fbc4047bec',

  // Get free key at: https://the-odds-api.com/#get-access
  ODDS_API_KEY: process.env.ODDS_API_KEY || '31160cd5ee324a5d53ade8cfa82e5ddb',

  // Twilio WhatsApp — set these in Railway environment variables
  // Get from: console.twilio.com → Account Info
  TWILIO_ACCOUNT_SID:    process.env.TWILIO_ACCOUNT_SID    || '',
  TWILIO_AUTH_TOKEN:     process.env.TWILIO_AUTH_TOKEN      || '',
  TWILIO_WHATSAPP_FROM:  process.env.TWILIO_WHATSAPP_FROM   || 'whatsapp:+14155238886', // Twilio sandbox default
  TWILIO_WHATSAPP_TO:    process.env.TWILIO_WHATSAPP_TO     || '', // Your WhatsApp e.g. whatsapp:+256XXXXXXXXX
};
