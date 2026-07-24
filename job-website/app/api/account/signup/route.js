const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');
const { EMAIL_RE } = require('../../../../lib/validation');
const {
  createSessionToken,
  sessionCookieHeader,
  generateVerificationToken,
  generateVerificationCode,
  hashVerificationToken,
  VERIFICATION_TOKEN_TTL_MS,
} = require('../../../../lib/candidate-auth');
const { sendEmail, candidateVerificationEmail } = require('../../../../lib/email');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Candidate self-service signup for the "My Space" dashboard. Unlike
// Employer registration, there is no approval gate - the account is usable
// immediately (email verification is informational/self-service only, it
// never blocks signing in or using the dashboard, matching this app's
// fail-soft email conventions elsewhere).
async function POST(request) {
  const ip = clientIp(request);
  const allowed = await checkRateLimit(`account-signup:${ip}`, { limit: 8, windowMs: 10 * 60_000 });
  if (!allowed) return json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').toString();

  const errors = {};
  if (!name) errors.name = 'Full name is required.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email address is required.';
  if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (Object.keys(errors).length) {
    return json({ error: 'Please fix the highlighted fields.', fieldErrors: errors }, { status: 400 });
  }

  const existing = await prisma.candidateAccount.findUnique({ where: { email } });
  if (existing) {
    return json(
      { error: 'An account with this email already exists.', fieldErrors: { email: 'Already registered.' } },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const rawToken = generateVerificationToken();
  const verificationTokenHash = hashVerificationToken(rawToken);
  const rawCode = generateVerificationCode();
  const verificationCodeHash = hashVerificationToken(rawCode);
  const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

  let candidate;
  try {
    candidate = await prisma.candidateAccount.create({
      data: {
        name,
        phone: phone || null,
        email,
        passwordHash,
        verificationTokenHash,
        verificationCodeHash,
        verificationTokenExpiresAt,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return json(
        { error: 'An account with this email already exists.', fieldErrors: { email: 'Already registered.' } },
        { status: 409 }
      );
    }
    console.error('[account signup] failed to create candidate account', err);
    return json({ error: 'Something went wrong creating your account. Please try again.' }, { status: 500 });
  }

  // Verification email - best-effort, never blocks/fails signup.
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3100';
  const verifyUrl = `${base}/api/account/verify?token=${rawToken}`;
  const { subject, html, text } = candidateVerificationEmail({ name, verifyUrl, code: rawCode });
  await sendEmail({ to: email, subject, html, text });

  const token = createSessionToken(candidate);
  return new Response(JSON.stringify({ ok: true, name: candidate.name }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token),
    },
  });
}

module.exports = { POST };
