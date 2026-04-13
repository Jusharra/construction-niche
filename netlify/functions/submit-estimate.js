// Netlify serverless function — handles estimate form submissions.
//
// On each submission it attempts (in parallel):
//   1. Forward payload to Airtable webhook      → AIRTABLE_WEBHOOK_URL
//   2. Send SendGrid email notification          → SENDGRID_API_KEY + SENDGRID_FROM_EMAIL + OWNER_NOTIFICATION_EMAIL
//   3. Send Twilio SMS notification to owner    → TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER + OWNER_NOTIFICATION_PHONE
//
// All three destinations are optional — the function returns 200 as long as
// the form payload is valid. Configure each in:
//   Netlify Dashboard → Site → Environment variables

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  if (!payload.name || !payload.email || !payload.phone) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Name, email, and phone are required.' }) };
  }

  // Run all three destinations concurrently — failures are logged, not fatal
  const results = await Promise.allSettled([
    forwardToAirtable(payload),
    sendEmailNotification(payload),
    sendSmsNotification(payload)
  ]);

  results.forEach((r, i) => {
    const label = ['Airtable', 'SendGrid', 'Twilio SMS'][i];
    if (r.status === 'rejected') {
      console.error(`${label} error:`, r.reason?.message || r.reason);
    } else {
      console.log(`${label}: OK`);
    }
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true })
  };
};

// ── Airtable webhook ────────────────────────────────────────────────────────
async function forwardToAirtable(payload) {
  const url = process.env.AIRTABLE_WEBHOOK_URL;
  if (!url) return; // not configured — skip silently

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok && res.status !== 202) {
    throw new Error(`Airtable responded ${res.status}`);
  }
}

// ── SendGrid email ──────────────────────────────────────────────────────────
async function sendEmailNotification(payload) {
  const apiKey   = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL;
  const toEmail  = process.env.OWNER_NOTIFICATION_EMAIL;

  if (!apiKey || !fromEmail || !toEmail) return; // not configured — skip silently

  const { name, phone, email, service_address, city, state, zip_code, project_type, description } = payload;
  const location = [service_address, city, state, zip_code].filter(Boolean).join(', ');
  const subject  = `New Estimate Request — ${project_type || 'General'} — ${city || 'TX'}`;

  const textBody = [
    '=== New Estimate Request ===',
    '',
    `Name:         ${name}`,
    `Phone:        ${phone}`,
    `Email:        ${email}`,
    `Address:      ${location}`,
    `Project Type: ${project_type || 'Not specified'}`,
    '',
    'Description:',
    description || 'None provided',
    '',
    '─────────────────────────────',
    `Reply-To: ${email}  |  Call: ${phone}`,
    'Submitted via walldoctortx.com'
  ].join('\n');

  const htmlBody = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:#1c1c1c;padding:20px 24px;">
    <h2 style="color:#f5c318;margin:0;font-size:18px;">New Estimate Request</h2>
    <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">Wall Doctor TX — walldoctortx.com</p>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:6px 0;color:#666;width:130px;">Name</td><td style="padding:6px 0;font-weight:600;">${name}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;"><a href="tel:${phone}" style="color:#e8722a;">${phone}</a></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${email}" style="color:#e8722a;">${email}</a></td></tr>
      <tr><td style="padding:6px 0;color:#666;">Address</td><td style="padding:6px 0;">${location || '—'}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">Project Type</td><td style="padding:6px 0;">${project_type || 'Not specified'}</td></tr>
    </table>
    ${description ? `<div style="margin-top:16px;padding:12px 16px;background:#f5f5f5;border-radius:6px;border-left:3px solid #f5c318;"><p style="margin:0 0 6px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em;">Description</p><p style="margin:0;font-size:14px;line-height:1.6;">${description.replace(/\n/g, '<br>')}</p></div>` : ''}
    <div style="margin-top:20px;display:flex;gap:12px;">
      <a href="tel:${phone}" style="display:inline-block;padding:10px 20px;background:#f5c318;color:#1c1c1c;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Call ${name.split(' ')[0]}</a>
      <a href="mailto:${email}" style="display:inline-block;padding:10px 20px;background:#1c1c1c;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Reply by Email</a>
    </div>
  </div>
</div>`.trim();

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail, name: 'Wall Doctor TX' },
      reply_to: { email, name },
      subject,
      content: [
        { type: 'text/plain', value: textBody },
        { type: 'text/html',  value: htmlBody }
      ]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SendGrid ${res.status}: ${errText}`);
  }
}

// ── Twilio SMS ──────────────────────────────────────────────────────────────
async function sendSmsNotification(payload) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;  // your Twilio number: +18176709771
  const to    = process.env.OWNER_NOTIFICATION_PHONE; // your personal cell

  if (!sid || !token || !from || !to) return; // not configured — skip silently

  const { name, phone, project_type, city } = payload;
  const body = `Wall Doctor TX lead: ${name} · ${phone} · ${project_type || 'General'} · ${city || 'TX'} — reply or call to follow up`;

  const params = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Twilio ${res.status}: ${errText}`);
  }
}
