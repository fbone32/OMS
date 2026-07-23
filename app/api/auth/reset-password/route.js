const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { logAudit } = require('../../../../lib/audit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { token, newPassword } = body;
  if (!token || !newPassword || newPassword.length < 8) {
    return json({ error: 'A token and a password of at least 8 characters are required' }, { status: 400 });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return json({ error: 'This reset link is invalid or has expired' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  await logAudit({ session: null, action: 'PASSWORD_RESET_COMPLETED', targetType: 'User', targetId: record.userId });

  return json({ ok: true });
}

module.exports = { POST };
