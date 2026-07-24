// Candidate session auth for the "My Space" self-service dashboard. Same
// lightweight signed-cookie pattern as lib/auth.js and lib/employer-auth.js
// (base64url(json) + HMAC-SHA256 signature, httpOnly/Secure/SameSite=Lax
// cookie) but with its OWN secret and cookie name, deliberately isolated
// from the HR admin session AND the employer session - a compromised
// candidate session must never double as either of those, or vice versa.
const crypto = require('crypto');

const SESSION_COOKIE = 'oba_jobs_candidate_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days - a candidate's own account, not a work session

function getSecret() {
  // Same fallback pattern as lib/employer-auth.js: falls back to the shared
  // admin session secret's env var rather than introducing a third required
  // secret, but signs with its own fixed prefix (see sign() below) so the
  // token is still distinct even when both share the same underlying value.
  const secret = process.env.JOB_WEBSITE_CANDIDATE_SESSION_SECRET || process.env.JOB_WEBSITE_SESSION_SECRET;
  if (!secret) {
    throw new Error('JOB_WEBSITE_CANDIDATE_SESSION_SECRET (or JOB_WEBSITE_SESSION_SECRET) env var is not set');
  }
  return secret;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(`candidate:${payloadB64}`).digest('base64url');
}

function createSessionToken(candidate) {
  const payload = {
    cid: candidate.id,
    email: candidate.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return null;
  let expectedSig;
  try {
    expectedSig = sign(payloadB64);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  if (!payload.cid) return null;
  return payload;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function getSession(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies[SESSION_COOKIE];
  return verifySessionToken(token);
}

function sessionCookieHeader(token, { clear = false } = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${SESSION_COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

// Email verification token: a random raw token is emailed to the candidate
// (see lib/email.js candidateVerificationEmail), and only its SHA-256 hash
// is ever stored on the CandidateAccount row - same "store a hash, not the
// secret" shape as the (currently unused) AdminPasswordResetToken model
// above in the schema. Only one live token per account; resend just
// overwrites verificationTokenHash/verificationTokenExpiresAt.
const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateVerificationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashVerificationToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function unauthorized(message = 'Not authenticated') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Enforces a valid candidate session cookie. Returns { session } or { errorResponse }. */
function requireCandidate(request) {
  const session = getSession(request);
  if (!session) return { errorResponse: unauthorized() };
  return { session };
}

// Server-component helper: read + verify the session cookie directly from
// next/headers' cookies() (no Request object available there), for use in
// server components/layouts like the OMS-side employer dashboard layout.
function getSessionFromCookieStore(cookieStore) {
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}

module.exports = {
  SESSION_COOKIE,
  VERIFICATION_TOKEN_TTL_MS,
  createSessionToken,
  verifySessionToken,
  getSession,
  getSessionFromCookieStore,
  sessionCookieHeader,
  requireCandidate,
  unauthorized,
  generateVerificationToken,
  hashVerificationToken,
};
