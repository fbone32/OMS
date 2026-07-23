// Real transactional email via Resend (https://resend.com). Every place in
// this codebase that needs to notify someone by email — password reset,
// new-hire onboarding, Client Portal invites, contract renewal reminders,
// invoice-sent notices, leave/procurement decision notices — funnels through
// this one helper instead of separately rolling its own "log instead of
// send" stopgap (the pattern app/api/auth/forgot-password/route.js
// originally established, now replaced everywhere it appeared).
//
// *** REQUIRED NEW ENV VAR: RESEND_API_KEY ***
// Must be set in every environment that should actually send email — local
// .env AND the Vercel project's production/preview env vars — same category
// of gap as SESSION_SECRET (lib/auth.js) and VAULT_ENCRYPTION_KEY
// (lib/vault-crypto.js), both of which a prior session shipped without
// confirming were actually configured in production. UNLIKE those two,
// sendEmail() below deliberately does NOT throw when the key is missing or
// invalid — it fails soft-but-loud: logs a clear console.error and resolves
// to { ok: false, error } so the calling route can finish the request
// normally (e.g. the password-reset route still logs the raw reset link
// server-side as a fallback, exactly like it did before this file existed).
// A missing RESEND_API_KEY must never 500 an otherwise-successful action —
// "the account got created / the invoice got marked sent / the leave got
// approved, but the notification email didn't go out" is the honest
// degraded state, not a hard failure of the whole request.
//
// Sender address: defaults to Resend's own sandbox testing address
// (onboarding@resend.dev), which Resend accepts with zero setup. A real
// branded sender (e.g. noreply@openbaseafrica.com) requires verifying a
// sending domain in the Resend dashboard + adding DNS records with whoever
// hosts that domain — a separate, manual step this codebase cannot perform
// for you. Until a domain is verified, Resend's sandbox mode will only
// actually deliver to the Resend account owner's own verified email address
// — every other `to` address is accepted by the API but silently not
// delivered, on Resend's side, not this file's. Override the sender via the
// optional RESEND_FROM_EMAIL env var once a domain is verified.
const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || 'OBA Platform <onboarding@resend.dev>';

let cachedClient = null;
let cachedKey = null;

function getClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  try {
    // Lazy require so importing this module never costs anything (or can
    // ever throw at module-load time) for requests that don't end up
    // sending mail, and so a from-scratch environment without the env var
    // set yet doesn't need the SDK to even initialize cleanly.
    const { Resend } = require('resend');
    cachedClient = new Resend(apiKey);
    cachedKey = apiKey;
    return cachedClient;
  } catch (err) {
    console.error('[email] failed to load the Resend SDK — is the "resend" package installed?', err);
    return null;
  }
}

/**
 * Sends one email via Resend. NEVER throws — always resolves to
 * { ok: true, id } or { ok: false, error }, so callers can log/audit the
 * outcome but must never let a missing/broken mail provider fail the API
 * route that triggered it.
 *
 * @param {{ to: string|string[], subject: string, html: string, text?: string, replyTo?: string }} args
 */
async function sendEmail({ to, subject, html, text, replyTo }) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    console.error(`[email] sendEmail called with no recipient — subject: "${subject}"`);
    return { ok: false, error: 'No recipient address supplied' };
  }
  const client = getClient();
  if (!client) {
    console.error(
      `[email] RESEND_API_KEY is not configured in this environment — email NOT sent ` +
      `(to=${JSON.stringify(to)}, subject="${subject}"). Set RESEND_API_KEY to enable real sending.`
    );
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
    // Covers network failures, malformed responses, or any other SDK-level
    // throw — this function's whole contract is that it never propagates.
    console.error('[email] sendEmail threw unexpectedly:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = { sendEmail, DEFAULT_FROM };
