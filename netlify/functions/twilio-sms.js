// Netlify function — Twilio SMS webhook handler
//
// Configure in Twilio Console:
//   Phone Numbers → Manage → (817) 670-9771
//   Messaging → A message comes in → Webhook → POST
//   URL: https://walldoctortx.com/.netlify/functions/twilio-sms
//
// Environment variables:
//   TWILIO_AUTH_TOKEN      — used to validate the request came from Twilio
//   SMS_AUTO_REPLY         — (optional) override the default auto-reply message

const crypto = require('crypto');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Validate the request came from Twilio
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const signature  = event.headers['x-twilio-signature'] || '';
    const host       = event.headers['x-forwarded-host'] || event.headers.host || '';
    const requestUrl = `https://${host}${event.path}`;
    const params     = parseFormBody(event.body || '');

    if (!isValidTwilioSignature(authToken, signature, requestUrl, params)) {
      console.warn('Invalid Twilio signature — request rejected');
      return { statusCode: 403, body: 'Forbidden' };
    }
  }

  const replyText = process.env.SMS_AUTO_REPLY ||
    "Thanks for texting Wall Doctor TX! We'll reply within 1 business day. " +
    "Need a free estimate? Visit walldoctortx.com or call (817) 670-9771.";

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(replyText)}</Message>
</Response>`;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    body: twiml
  };
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseFormBody(body) {
  const params = {};
  if (!body) return params;
  for (const pair of body.split('&')) {
    const [key, val] = pair.split('=').map(decodeURIComponent);
    if (key) params[key] = val || '';
  }
  return params;
}

function isValidTwilioSignature(authToken, signature, url, params) {
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
  const toSign = url + sortedParams;

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(toSign, 'utf-8'))
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
