const { prisma } = require('../../../../lib/db');
const {
  requireCandidate,
  generateVerificationToken,
  generateVerificationCode,
  hashVerificationToken,
  VERIFICATION_TOKEN_TTL_MS,
} = require('../../../../lib/candidate-auth');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');
const { sendEmail, candidateVerificationEmail } = require('../../../../lib/email');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  const ip = clientIp(request);
  const allowed = await checkRateLimit(`account-resend-verify:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!allowed) return json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  const candidate = await prisma.candidateAccount.findUnique({ where: { id: session.cid } });
  if (!candidate) return json({ error: 'Account not found.' }, { status: 404 });
  if (candidate.emailVerified) return json({ ok: true, alreadyVerified: true });

  const rawToken = generateVerificationToken();
  const verificationTokenHash = hashVerificationToken(rawToken);
  const rawCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationToken(rawCode);
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  await prisma.candidateAccount.update({
    where: { id: candidate.id },
    data: { verificationTokenHash, verificationCodeHash, verificationTokenExpiresAt },
  });

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3100';
  const verifyUrl = `${base}/api/account/verify?token=${rawToken}`;
  const { subject, html, text } = candidateVerificationEmail({ name: candidate.name, verifyUrl, code: rawCode });
  const emailResult = await sendEmail({ to: candidate.email, subject, html, text });

  return json({ ok: true, emailSent: emailResult.ok });
}

module.exports = { POST };
