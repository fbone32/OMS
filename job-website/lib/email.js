// Real transactional email via Resend, same provider/pattern as the root
// OMS app's lib/email.js — but a SEPARATE implementation with its OWN
// RESEND_API_KEY, since this app is a separate Vercel project with its own
// Root Directory (its build never sees files outside job-website/, so a
// relative `require('../../lib/email.js')` reaching into the OMS app would
// be fragile/unsupported across two independent deployments). Set the SAME
// Resend API key value in both projects' env vars if you want both apps
// sending from the same Resend account — that's an operational choice, not
// a code dependency between the two apps.
//
// Never throws — always resolves to { ok: true, id } or { ok: false, error },
// same soft-fail contract as the OMS's version, so a missing/broken mail
// provider never fails the application-submission request itself (the
// candidate's application is real and saved either way).
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'OBA Jobs <onboarding@resend.dev>';

let cachedClient = null;
let cachedKey = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  try {
    const { Resend } = require('resend');
    cachedClient = new Resend(apiKey);
    cachedKey = apiKey;
    return cachedClient;
  } catch (err) {
    console.error('[email] failed to load the Resend SDK', err);
    return null;
  }
}

async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!to) return { ok: false, error: 'No recipient address supplied' };
  const client = getClient();
  if (!client) {
    console.error(`[email] RESEND_API_KEY not configured — email NOT sent (to=${to}, subject="${subject}")`);
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to,
      subject,
      html,
      text: text || undefined,
      replyTo: replyTo || undefined,
    });
    if (error) {
      console.error('[email] Resend API returned an error:', error);
      return { ok: false, error: (error && error.message) || String(error) };
    }
    return { ok: true, id: data && data.id };
  } catch (err) {
    console.error('[email] sendEmail threw unexpectedly:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

function applicationConfirmationEmail({ fullName, jobTitle, branch }) {
  const subject = `We received your application — ${jobTitle}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#0D2B4E;padding:24px;text-align:center;">
        <span style="color:#C8960C;font-weight:800;font-size:13px;letter-spacing:0.14em;">OPEN BASE AFRICA</span>
      </div>
      <div style="padding:28px 24px;color:#0D2B4E;">
        <h2 style="margin:0 0 12px;">Thanks, ${escapeHtml(fullName)}!</h2>
        <p style="font-size:14px;line-height:1.6;color:#333;">
          We've received your application for <strong>${escapeHtml(jobTitle)}</strong>
          (${escapeHtml(branch)}). Our HR team will review it and reach out if
          you're shortlisted for the next step.
        </p>
        <p style="font-size:13px;line-height:1.6;color:#666;">
          If you didn't apply for this role, you can request your data be
          deleted at any time — see our Privacy Policy for details.
        </p>
        <p style="font-size:13px;color:#999;margin-top:24px;">— Open Base Africa HR</p>
      </div>
    </div>`;
  return { subject, html, text: `Thanks ${fullName}! We received your application for ${jobTitle} (${branch}).` };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendEmail, applicationConfirmationEmail };
