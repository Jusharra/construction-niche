// Netlify function — serves VAPI public key + assistant ID to the browser.
//
// The public key and assistant ID are stored as environment variables so they
// never appear in source code or the git repository.
//
// The browser calls this endpoint once on page load.  If VAPI_PUBLIC_KEY is not
// set the endpoint returns 404 and the call button is simply not shown.
//
// Environment variables (set in Netlify Dashboard → Site → Environment variables):
//   VAPI_PUBLIC_KEY    — your VAPI public API key
//   VAPI_ASSISTANT_ID  — the VAPI assistant ID to use for web calls

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const publicKey   = process.env.VAPI_PUBLIC_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!publicKey) {
    // VAPI not configured — tell client not to show the button
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'VAPI not configured' })
    };
  }

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      // Short cache — allows instant re-config without a redeploy
      'Cache-Control': 'public, max-age=300'
    },
    body: JSON.stringify({ publicKey, assistantId })
  };
};
