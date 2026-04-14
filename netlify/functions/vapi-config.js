// Netlify function — serves VAPI public key + assistant ID to the browser.
//
// Always returns 200 so Netlify's CDN never intercepts the response.
// When VAPI_PUBLIC_KEY is not set, returns { configured: false } and the
// chat widget is not injected.
//
// Environment variables (Netlify Dashboard → Site → Environment variables):
//   VAPI_PUBLIC_KEY    — your VAPI public API key  (app.vapi.ai → Account → API Keys)
//   VAPI_ASSISTANT_ID  — the VAPI assistant ID     (app.vapi.ai → Assistants)

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const publicKey   = process.env.VAPI_PUBLIC_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(
      publicKey
        ? { configured: true, publicKey, assistantId }
        : { configured: false }
    )
  };
};
