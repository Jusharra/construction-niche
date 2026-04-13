// Netlify function — proxies text chat messages to VAPI's chat API.
//
// Environment variables (Netlify Dashboard → Site → Environment variables):
//   VAPI_PRIVATE_KEY   — your VAPI server-side API key
//                        Found at: app.vapi.ai → Account → API Keys → copy the Private key
//   VAPI_ASSISTANT_ID  — same assistant ID used for voice
//
// The private key is never exposed to the browser — all chat requests
// flow through this function.

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const privateKey  = process.env.VAPI_PRIVATE_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;

  if (!privateKey || !assistantId) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Chat not configured' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { message, sessionId } = body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'message is required' }) };
  }

  const vapiPayload = {
    assistantId,
    input: [{ role: 'user', content: message.trim() }]
  };
  if (sessionId) vapiPayload.sessionId = sessionId;

  let vapiRes;
  try {
    vapiRes = await fetch('https://api.vapi.ai/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${privateKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(vapiPayload)
    });
  } catch (err) {
    console.error('VAPI network error:', err.message);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI unavailable' })
    };
  }

  if (!vapiRes.ok) {
    const errText = await vapiRes.text().catch(() => '');
    console.error('VAPI chat error:', vapiRes.status, errText);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'AI unavailable' })
    };
  }

  const data = await vapiRes.json();

  // VAPI response shape: { output: { role: 'assistant', content: '...' }, sessionId: '...' }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reply:     data.output?.content || data.message || '',
      sessionId: data.sessionId || sessionId || null
    })
  };
};
