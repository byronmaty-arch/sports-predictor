/**
 * WhatsApp notification channel via Twilio
 * Send-only — daily slip and critical alerts delivered to WhatsApp as redundancy
 */

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, TWILIO_WHATSAPP_TO } = require('./config');

// WhatsApp message limit is 1600 characters — split long messages into chunks
const MAX_CHARS = 1550;

function isConfigured() {
  return !!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_TO);
}

function splitMessage(text) {
  if (text.length <= MAX_CHARS) return [text];

  const chunks = [];
  const lines = text.split('\n');
  let current = '';

  for (const line of lines) {
    if ((current + '\n' + line).length > MAX_CHARS) {
      if (current) chunks.push(current.trim());
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function sendWhatsApp(message) {
  if (!isConfigured()) {
    console.log('[whatsapp] Not configured — skipping. Set TWILIO_* env vars to enable.');
    return;
  }

  // Lazy-load twilio so the bot still starts if twilio isn't installed yet
  let twilio;
  try {
    twilio = require('twilio');
  } catch {
    console.warn('[whatsapp] twilio package not found. Run: npm install twilio');
    return;
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  const chunks = splitMessage(message);

  for (let i = 0; i < chunks.length; i++) {
    try {
      await client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to:   TWILIO_WHATSAPP_TO,
        body: chunks.length > 1 ? `(${i + 1}/${chunks.length})\n${chunks[i]}` : chunks[i],
      });
      console.log(`[whatsapp] Sent chunk ${i + 1}/${chunks.length}`);
      // Small delay between chunks
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`[whatsapp] Failed to send chunk ${i + 1}:`, err.message);
    }
  }
}

module.exports = { sendWhatsApp, isConfigured };
