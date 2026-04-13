// Netlify function — Twilio Voice webhook handler
//
// Configure in Twilio Console:
//   Phone Numbers → Manage → (817) 670-9771
//   Voice → A call comes in → Webhook → POST
//   URL: https://walldoctortx.com/.netlify/functions/twilio-voice
//
// Environment variables:
//   TWILIO_AUTH_TOKEN      — used to validate the request came from Twilio
//   TWILIO_FORWARD_TO      — (optional) E.164 number to forward calls to, e.g. +14695551234
//                            If not set, caller hears a greeting and is prompted to leave a voicemail.

const crypto = require('crypto');

exports.handler = async function (event) {
  // Twilio sends POST with form-encoded body
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

  // If VAPI is configured for inbound calls, redirect Twilio there directly.
  // Set VAPI_TWILIO_WEBHOOK to the webhook URL shown in your VAPI dashboard
  // under Phone Numbers → your number → Twilio Webhook URL.
  const vapiWebhook = process.env.VAPI_TWILIO_WEBHOOK;
  if (vapiWebhook) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Redirect method="POST">${vapiWebhook}</Redirect>\n</Response>`
    };
  }

  const forwardTo = process.env.TWILIO_FORWARD_TO;

  let twiml;
  if (forwardTo) {
    // Forward the call to the owner's number
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thanks for calling Wall Doctor TX. Please hold while we connect your call.</Say>
  <Dial callerId="${process.env.TWILIO_FROM_NUMBER || '+18176709771'}" timeout="20">
    <Number>${forwardTo}</Number>
  </Dial>
  <Say voice="Polly.Joanna">We missed your call. Please leave a message after the tone and we will get back to you within one business day.</Say>
  <Record maxLength="120" transcribe="true" />
</Response>`;
  } else {
    // No forwarding — play greeting and record voicemail
    twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">
    Thank you for calling Wall Doctor TX, serving Dallas Fort Worth and Greater Houston.
    Our team is unavailable right now. Please leave a message after the tone and we will
    return your call within one business day. You can also request a free estimate at
    wall doctor T X dot com.
  </Say>
  <Record maxLength="120" transcribe="true" />
</Response>`;
  }

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
  // Build the validation string: URL + sorted key-value pairs
  const sortedParams = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], '');
  const toSign = url + sortedParams;

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(toSign, 'utf-8'))
    .digest('base64');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
