const { prisma } = require('../../../../lib/db');
const { requireCandidate, verifyCodeMatches } = require('../../../../lib/candidate-auth');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Companion to the emailed link: lets a signed-in candidate type the
// six-digit code instead of switching apps to click through. Always checked
// against the caller's own session row, never looked up by code, since the
// code alone isn't unique enough to double as a lookup key.
async function POST(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  const ip = clientIp(request);
  const allowed = await checkRateLimit(`account-verify-code:${session.cid}:${ip}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!allowed) return json({ error: 'Too many attempts. Please try again later.' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = (body.code || '').toString().trim();
  if (!code) return json({ error: 'Enter the 6-digit code from your email.' }, { status: 400 });

  const candidate = await prisma.candidateAccount.findUnique({ where: { id: session.cid } });
  if (!candidate) return json({ error: 'Account not found.' }, { status: 404 });
  if (candidate.emailVerified) return json({ ok: true, alreadyVerified: true });

  if (!candidate.verificationTokenExpiresAt || candidate.verificationTokenExpiresAt < new Date()) {
    return json({ error: 'That code has expired. Request a new one.' }, { status: 400 });
  }
  if (!verifyCodeMatches(code, candidate.verificationCodeHash)) {
    return json({ error: 'That code is incorrect.' }, { status: 400 });
  }

  await prisma.candidateAccount.update({
    where: { id: candidate.id },
    data: {
      emailVerified: true,
      verificationTokenHash: null,
      verificationCodeHash: null,
      verificationTokenExpiresAt: null,
    },
  });

  return json({ ok: true });
}

module.exports = { POST };
