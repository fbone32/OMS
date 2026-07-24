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

function employerApprovedEmail({ companyName }) {
  const subject = 'Your employer account has been approved';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#0D2B4E;padding:24px;text-align:center;">
        <span style="color:#C8960C;font-weight:800;font-size:13px;letter-spacing:0.14em;">OPEN BASE AFRICA</span>
      </div>
      <div style="padding:28px 24px;color:#0D2B4E;">
        <h2 style="margin:0 0 12px;">Welcome, ${escapeHtml(companyName)}!</h2>
        <p style="font-size:14px;line-height:1.6;color:#333;">
          Your employer account on OBA Jobs has been approved. You can now sign in
          and start posting roles for candidates to apply to.
        </p>
        <p style="font-size:13px;line-height:1.6;color:#666;">
          Sign in any time from the "For Employers" link on our jobs site.
        </p>
        <p style="font-size:13px;color:#999;margin-top:24px;">Open Base Africa HR</p>
      </div>
    </div>`;
  return { subject, html, text: `Welcome, ${companyName}! Your employer account on OBA Jobs has been approved.` };
}

function employerRejectedEmail({ companyName, reason }) {
  const subject = 'Update on your employer account registration';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#0D2B4E;padding:24px;text-align:center;">
        <span style="color:#C8960C;font-weight:800;font-size:13px;letter-spacing:0.14em;">OPEN BASE AFRICA</span>
      </div>
      <div style="padding:28px 24px;color:#0D2B4E;">
        <h2 style="margin:0 0 12px;">Regarding your registration, ${escapeHtml(companyName)}</h2>
        <p style="font-size:14px;line-height:1.6;color:#333;">
          We were unable to approve your employer account registration on OBA Jobs at this time.
          ${reason ? escapeHtml(reason) : ''}
        </p>
        <p style="font-size:13px;line-height:1.6;color:#666;">
          If you have questions, please get in touch and we will be happy to help.
        </p>
        <p style="font-size:13px;color:#999;margin-top:24px;">Open Base Africa HR</p>
      </div>
    </div>`;
  return { subject, html, text: `We were unable to approve your employer account registration on OBA Jobs at this time.` };
}

function candidateVerificationEmail({ name, verifyUrl, code }) {
  const subject = 'Verify your email for OBA Jobs My Space';
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;">
      <div style="background:#0D2B4E;padding:24px;text-align:center;">
        <span style="color:#C8960C;font-weight:800;font-size:13px;letter-spacing:0.14em;">OPEN BASE AFRICA</span>
      </div>
      <div style="padding:28px 24px;color:#0D2B4E;">
        <h2 style="margin:0 0 12px;">Hi ${escapeHtml(name)},</h2>
        <p style="font-size:14px;line-height:1.6;color:#333;">
          Please confirm your email address to finish setting up your OBA Jobs My Space account.
        </p>
        <p style="text-align:center;margin:24px 0;">
          <a href="${verifyUrl}" style="background:#C8960C;color:#fff;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;text-decoration:none;display:inline-block;">
            Verify my email
          </a>
        </p>
        <p style="font-size:13px;line-height:1.5;color:#666;text-align:center;margin:0 0 6px;">
          Or enter this code in My Space:
        </p>
        <p style="text-align:center;margin:0 0 24px;">
          <span style="display:inline-block;background:#F5F7FA;border:1px solid #D8DFE7;border-radius:8px;padding:12px 20px;font-size:22px;font-weight:800;letter-spacing:0.3em;color:#0D2B4E;">
            ${escapeHtml(code)}
          </span>
        </p>
        <p style="font-size:12.5px;line-height:1.6;color:#999;">
          The link and code both expire in 24 hours. If you did not create this account, you can ignore this email.
        </p>
        <p style="font-size:13px;color:#999;margin-top:24px;">Open Base Africa HR</p>
      </div>
    </div>`;
  return {
    subject,
    html,
    text: `Hi ${name}, verify your email for OBA Jobs My Space: ${verifyUrl}\n\nOr enter this code in My Space: ${code}`,
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendEmail, applicationConfirmationEmail, employerApprovedEmail, employerRejectedEmail, candidateVerificationEmail };
