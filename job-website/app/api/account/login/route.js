const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { createSessionToken, sessionCookieHeader } = require('../../../../lib/candidate-auth');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Candidate login. Deliberately a SEPARATE route/cookie/secret from both HR
// admin and employer login (see lib/candidate-auth.js) so a candidate
// session can never reach /admin/** or /employer/**, and vice versa.
async function POST(request) {
  const ip = clientIp(request);
  const allowed = await checkRateLimit(`account-login:${ip}`, { limit: 10, windowMs: 5 * 60_000 });
  if (!allowed) return json({ error: 'Too many login attempts. Try again in a few minutes.' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').toString();

  if (!email || !password) {
    return json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const candidate = await prisma.candidateAccount.findUnique({ where: { email } });
  if (!candidate) return json({ error: 'Invalid email or password.' }, { status: 401 });

  const passwordOk = await bcrypt.compare(password, candidate.passwordHash);
  if (!passwordOk) return json({ error: 'Invalid email or password.' }, { status: 401 });

  const token = createSessionToken(candidate);
  return new Response(JSON.stringify({ ok: true, name: candidate.name }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token),
    },
  });
}

module.exports = { POST };
