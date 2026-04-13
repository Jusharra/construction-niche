// Netlify serverless function — handles estimate form submissions.
//
// On each submission it attempts (in parallel):
//   1. Forward payload to Airtable webhook      → AIRTABLE_WEBHOOK_URL
//   2. Send SendGrid admin notification          → SENDGRID_API_KEY + SENDGRID_FROM_EMAIL + OWNER_NOTIFICATION_EMAIL
//   3. Send SendGrid customer confirmation       → same keys, sends to payload.email
//   4. Send Twilio SMS notification to owner    → TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER + OWNER_NOTIFICATION_PHONE
//
// All destinations are optional — the function returns 200 as long as
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

  // Run all destinations concurrently — failures are logged, not fatal
  const results = await Promise.allSettled([
    forwardToAirtable(payload),
    sendAdminNotification(payload),
    sendCustomerConfirmation(payload),
    sendSmsNotification(payload)
  ]);

  results.forEach((r, i) => {
    const label = ['Airtable', 'SendGrid (admin)', 'SendGrid (customer)', 'Twilio SMS'][i];
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
  if (!url) return;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok && res.status !== 202) {
    throw new Error(`Airtable responded ${res.status}`);
  }
}

// ── SendGrid helpers ─────────────────────────────────────────────────────────
function getSendGridConfig() {
  return {
    apiKey:    process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@walldoctortx.com',
    toEmail:   process.env.OWNER_NOTIFICATION_EMAIL
  };
}

async function sendViaSendGrid({ apiKey, fromEmail, toEmail, replyTo, subject, textBody, htmlBody }) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail, name: 'Wall Doctor TX' },
      ...(replyTo && { reply_to: replyTo }),
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

// ── Admin notification email ─────────────────────────────────────────────────
async function sendAdminNotification(payload) {
  const { apiKey, fromEmail, toEmail } = getSendGridConfig();
  if (!apiKey || !toEmail) return;

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
    <div style="margin-top:20px;">
      <a href="tel:${phone}" style="display:inline-block;padding:10px 20px;background:#f5c318;color:#1c1c1c;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Call ${name.split(' ')[0]}</a>
      &nbsp;
      <a href="mailto:${email}" style="display:inline-block;padding:10px 20px;background:#1c1c1c;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Reply by Email</a>
    </div>
  </div>
</div>`.trim();

  await sendViaSendGrid({
    apiKey, fromEmail, toEmail,
    replyTo: { email, name },
    subject, textBody, htmlBody
  });
}

// ── Customer confirmation email ──────────────────────────────────────────────
async function sendCustomerConfirmation(payload) {
  const { apiKey, fromEmail } = getSendGridConfig();
  if (!apiKey) return;

  const { name, email, project_type, city } = payload;
  const firstName = name.split(' ')[0];
  const subject   = `We received your estimate request — Wall Doctor TX`;

  const textBody = [
    `Hi ${firstName},`,
    '',
    'Thanks for reaching out to Wall Doctor TX! We received your estimate request and will be in touch within 2 business days.',
    '',
    `Project Type: ${project_type || 'Not specified'}`,
    `City:         ${city || 'TX'}`,
    '',
    'In the meantime, feel free to call or text us directly:',
    '  Phone: (817) 670-9771',
    '  Email: info@walldoctortx.com',
    '',
    'We look forward to working with you.',
    '',
    '— The Wall Doctor TX Team',
    'https://walldoctortx.com'
  ].join('\n');

  const htmlBody = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
  <div style="background:#1c1c1c;padding:20px 24px;">
    <h2 style="color:#f5c318;margin:0;font-size:18px;">Wall Doctor TX</h2>
    <p style="color:rgba(255,255,255,0.7);margin:4px 0 0;font-size:13px;">Dallas-Fort Worth &amp; Greater Houston</p>
  </div>
  <div style="padding:24px;">
    <h3 style="margin:0 0 12px;font-size:17px;color:#1c1c1c;">Hi ${firstName}, we got your request!</h3>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
      Thanks for reaching out to Wall Doctor TX. We received your estimate request and one of our team members will be in touch within <strong>2 business days</strong>.
    </p>
    <div style="padding:12px 16px;background:#f5f5f5;border-radius:6px;border-left:3px solid #f5c318;margin-bottom:20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:.05em;">Your Request</p>
      <p style="margin:0;font-size:14px;color:#1c1c1c;"><strong>Project:</strong> ${project_type || 'Not specified'}</p>
      ${city ? `<p style="margin:4px 0 0;font-size:14px;color:#1c1c1c;"><strong>City:</strong> ${city}</p>` : ''}
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#444;">Need to reach us sooner?</p>
    <p style="margin:0 0 20px;font-size:14px;">
      <a href="tel:+18176709771" style="color:#e8722a;font-weight:600;">(817) 670-9771</a> &nbsp;·&nbsp;
      <a href="mailto:info@walldoctortx.com" style="color:#e8722a;font-weight:600;">info@walldoctortx.com</a>
    </p>
    <a href="https://walldoctortx.com" style="display:inline-block;padding:10px 20px;background:#f5c318;color:#1c1c1c;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px;">Visit walldoctortx.com</a>
  </div>
  <div style="background:#f9f9f9;padding:12px 24px;border-top:1px solid #e0e0e0;">
    <p style="margin:0;font-size:12px;color:#999;">You're receiving this because you submitted an estimate request at walldoctortx.com. Please do not reply to this email — contact us at <a href="mailto:info@walldoctortx.com" style="color:#999;">info@walldoctortx.com</a> instead.</p>
  </div>
</div>`.trim();

  await sendViaSendGrid({
    apiKey,
    fromEmail,
    toEmail: email,
    subject, textBody, htmlBody
  });
}

// ── Twilio SMS ──────────────────────────────────────────────────────────────
async function sendSmsNotification(payload) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  const to    = process.env.OWNER_NOTIFICATION_PHONE;

  if (!sid || !token || !from || !to) return;

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
