const crypto = require('crypto');
const { prisma } = require('../../../../lib/db');
const { logAudit } = require('../../../../lib/audit');
const { sendEmail } = require('../../../../lib/email');
const { renderEmailTemplate } = require('../../../../lib/email-templates');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Real email now goes out via Resend (see lib/email.js) — this used to be
// the "just log the reset link" stopgap and is now the established
// precedent every other email-sending route in this codebase follows. The
// server-side console.log stays as a deliberate fallback: if RESEND_API_KEY
// is missing/invalid, sendEmail() fails soft (never throws), so this route
// still logs the raw link so the flow is testable/debuggable either way.
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

  const user = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
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

  const emailResult = await sendEmail({
    to: email,
    subject: 'Reset your OBA Platform password',
    html: renderEmailTemplate('password-reset', {
      USER_FIRST_NAME: (user.employee ? user.employee.name.split(' ')[0] : user.email.split('@')[0]) || 'there',
      USER_EMAIL: email,
      RESET_URL: resetLink,
    }),
    text: `Reset your OBA Platform password: ${resetLink} (expires in 1 hour)`,
  });

  await logAudit({
    session: null,
    action: 'PASSWORD_RESET_REQUESTED',
    targetType: 'User',
    targetId: user.id,
    detail: { email, emailSent: emailResult.ok },
  });

  return genericResponse;
}

module.exports = { POST };
