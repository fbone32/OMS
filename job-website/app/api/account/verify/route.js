const { prisma } = require('../../../../lib/db');
const { hashVerificationToken } = require('../../../../lib/candidate-auth');

function redirectTo(path) {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3100';
  return new Response(null, { status: 302, headers: { Location: `${base}${path}` } });
}

// Email verification link target. A GET (not POST) because it's clicked
// straight from an email link - no session required, the token itself is
// the credential (hashed at rest, same shape as the AdminPasswordResetToken
// pattern already in the schema).
async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = (searchParams.get('token') || '').trim();
  if (!token) return redirectTo('/account/login?verifyError=1');

  const tokenHash = hashVerificationToken(token);
  const candidate = await prisma.candidateAccount.findUnique({ where: { verificationTokenHash: tokenHash } });

  if (!candidate || !candidate.verificationTokenExpiresAt || candidate.verificationTokenExpiresAt < new Date()) {
    return redirectTo('/account/login?verifyError=1');
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

  return redirectTo('/account/login?verified=1');
}

module.exports = { GET };
