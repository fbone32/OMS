// Admin session auth for the job-website's HR admin panel. Same lightweight
// signed-cookie pattern as the root OMS app's lib/auth.js (base64url(json) +
// HMAC-SHA256 signature, httpOnly/Secure/SameSite=Lax cookie) but with its
// OWN secret (JOB_WEBSITE_SESSION_SECRET) and cookie name, deliberately
// isolated from the OMS's own session cookie/secret — a compromised
// job-website session must never double as an OMS session or vice versa.
const crypto = require('crypto');

const SESSION_COOKIE = 'oba_jobs_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

function getSecret() {
  const secret = process.env.JOB_WEBSITE_SESSION_SECRET;
  if (!secret) {
    throw new Error('JOB_WEBSITE_SESSION_SECRET env var is not set');
  }
  return secret;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

function createSessionToken(admin) {
  const payload = {
    uid: admin.id,
    email: admin.email,
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

function unauthorized(message = 'Not authenticated') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Enforces a valid admin session cookie. Returns { session } or { errorResponse }. */
function requireAdmin(request) {
  const session = getSession(request);
  if (!session) return { errorResponse: unauthorized() };
  return { session };
}

module.exports = {
  SESSION_COOKIE,
  createSessionToken,
  verifySessionToken,
  getSession,
  sessionCookieHeader,
  requireAdmin,
  unauthorized,
};
