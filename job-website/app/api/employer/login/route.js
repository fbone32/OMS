const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { createSessionToken, sessionCookieHeader } = require('../../../../lib/employer-auth');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Employer login. Deliberately a SEPARATE route/cookie/secret from HR admin
// login (see lib/employer-auth.js) so an employer session can never reach
// /admin/** and an admin session can never be mistaken for an employer one.
// Only APPROVED employers may sign in - a PENDING/REJECTED/SUSPENDED
// employer gets a real password check (so we don't leak which accounts
// exist) but is then turned away with a status-specific message.
async function POST(request) {
  const ip = clientIp(request);
  const allowed = await checkRateLimit(`employer-login:${ip}`, { limit: 10, windowMs: 5 * 60_000 });
  if (!allowed) return json({ error: 'Too many login attempts. Try again in a few minutes.' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const loginEmail = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').toString();

  if (!loginEmail || !password) {
    return json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const employer = await prisma.employer.findUnique({ where: { loginEmail } });
  if (!employer) return json({ error: 'Invalid email or password.' }, { status: 401 });

  const passwordOk = await bcrypt.compare(password, employer.passwordHash);
  if (!passwordOk) return json({ error: 'Invalid email or password.' }, { status: 401 });

  if (employer.status === 'PENDING') {
    return json({ error: 'Your registration is still awaiting approval from our HR team.' }, { status: 403 });
  }
  if (employer.status === 'REJECTED') {
    return json({ error: 'This registration was not approved. Contact us if you believe this is a mistake.' }, { status: 403 });
  }
  if (employer.status === 'SUSPENDED') {
    return json({ error: 'This account has been suspended. Contact us for more information.' }, { status: 403 });
  }

  const token = createSessionToken(employer);
  return new Response(JSON.stringify({ ok: true, companyName: employer.companyName }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token),
    },
  });
}

module.exports = { POST };
