// Login-screen UX helper: given a partially/fully-typed email, tells the
// client which display name + role it belongs to, so the sign-in form can
// show "Signing in as Ama Owusu · Director" before the person even submits
// a password. This is a preview only — it never sees or checks a password,
// and real authentication still happens exactly as before via POST
// /api/auth/login.
//
// Deliberately scoped down to avoid becoming an email-enumeration oracle for
// an outside attacker while staying practical for an internal demo tool:
//   - GET only, one query param, no password ever touches this route.
//   - Cheap format validation short-circuits before touching the database at
//     all for anything that isn't email-shaped yet (also saves a DB round
//     trip on every keystroke on the client side, but this is the server-
//     side backstop for that).
//   - A generic { found: false } is returned for "bad format", "no such
//     user", and "rate limited" alike — no status-code or timing signal
//     tells a caller which case it hit.
//   - A simple in-memory per-IP rate limit (see lib/rate-limit.js) caps
//     enumeration speed. It is best-effort only (per warm serverless
//     instance, resets on cold start) — proportionate for a low-sensitivity
//     internal demo, not a substitute for a real shared rate limiter if this
//     app ever handles genuinely sensitive accounts.
const { prisma } = require('../../../../lib/db');
const { ROLE_LABELS } = require('../../../../lib/roles');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

const notFound = () => json({ found: false }, { status: 200 });

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim().toLowerCase();

  if (!email || email.length > 254 || !EMAIL_SHAPE.test(email)) {
    return notFound();
  }

  const ip = clientIp(request);
  if (!checkRateLimit(`role-hint:${ip}`, { limit: 30, windowMs: 60_000 })) {
    // Same shape as "not found" — a scripted caller learns nothing from
    // being throttled versus simply guessing wrong.
    return notFound();
  }

  let user;
  try {
    user = await prisma.user.findUnique({
      where: { email },
      select: { role: true, employee: { select: { name: true } } },
    });
  } catch (err) {
    console.error('[auth/role-hint] db error looking up email:', err);
    return notFound();
  }

  if (!user) return notFound();

  return json({
    found: true,
    displayName: user.employee ? user.employee.name : null,
    role: ROLE_LABELS[user.role] || user.role,
  });
}

module.exports = { GET };
