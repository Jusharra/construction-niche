// Netlify serverless function — proxies form data to Airtable webhook.
// The real webhook URL is stored as a Netlify environment variable (AIRTABLE_WEBHOOK_URL),
// so it is NEVER exposed in client-side code or the git repository.
//
// To configure:
//   Netlify Dashboard → Site → Environment variables → Add variable
//   Key:   AIRTABLE_WEBHOOK_URL
//   Value: your actual webhook URL

exports.handler = async function (event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookUrl = process.env.AIRTABLE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('AIRTABLE_WEBHOOK_URL environment variable is not set.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server configuration error.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  // Basic required-field validation on the server side
  if (!payload.name || !payload.email || !payload.phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields.' }) };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok || response.status === 200 || response.status === 202) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    }

    console.error('Webhook responded with status:', response.status);
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Upstream webhook error.' })
    };
  } catch (err) {
    console.error('Fetch to webhook failed:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to reach webhook.' })
    };
  }
};
