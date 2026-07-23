const crypto = require('crypto');
const { prisma } = require('../../../../lib/db');
const { logAudit } = require('../../../../lib/audit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// No real email sending yet — per the brief, it's fine to just log the reset
// link server-side for now. A production deploy would swap this for a real
// mailer (e.g. Resend) without changing the token/flow logic below.
async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = (body.email || '').trim().toLowerCase();
  const genericResponse = json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  if (!email) return genericResponse;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return genericResponse; // don't leak whether the email exists

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  const origin = request.headers.get('origin') || '';
  const resetLink = `${origin}/reset-password?token=${rawToken}`;
  // eslint-disable-next-line no-console
  console.log(`[password-reset] link for ${email}: ${resetLink}`);

  await logAudit({ session: null, action: 'PASSWORD_RESET_REQUESTED', targetType: 'User', targetId: user.id, detail: { email } });

  return genericResponse;
}

module.exports = { POST };
