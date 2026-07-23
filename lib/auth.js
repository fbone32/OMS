// Lightweight signed-cookie session auth — no heavy auth framework.
// A session token is `base64url(json payload).base64url(hmac-sha256 signature)`,
// stored in an httpOnly, Secure, SameSite=Lax cookie and verified server-side
// on every API route. The client never sees or supplies the role — every
// route re-derives `session.role` from this verified cookie, never from the
// request body/query.
const crypto = require('crypto');

const SESSION_COOKIE = 'oms_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Never silently run with a guessable secret; fail loudly at request time
    // (not at build time — this function is only called when a route executes).
    throw new Error('SESSION_SECRET env var is not set');
  }
  return secret;
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSecret()).update(payloadB64).digest('base64url');
}

function createSessionToken(user) {
  const payload = {
    uid: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId || null,
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

/** Reads + verifies the session from a Next.js Request object. Returns the
 * verified payload ({ uid, email, role, employeeId }) or null. */
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

/** Standard 401/403 JSON response helpers. */
function unauthorized(message = 'Not authenticated') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function forbidden(message = 'Not permitted for your role') {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Enforces that a request has a valid session AND the session role is in
 * `allowedRoles` (or allowedRoles is falsy = any authenticated role).
 * Returns { session } on success, or { errorResponse } to return immediately. */
function requireRole(request, allowedRoles) {
  const session = getSession(request);
  if (!session) return { errorResponse: unauthorized() };
  if (allowedRoles && allowedRoles.length && !allowedRoles.includes(session.role)) {
    return { errorResponse: forbidden() };
  }
  return { session };
}

module.exports = {
  SESSION_COOKIE,
  createSessionToken,
  verifySessionToken,
  getSession,
  sessionCookieHeader,
  requireRole,
  unauthorized,
  forbidden,
};
