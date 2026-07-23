const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { createSessionToken, sessionCookieHeader } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
    employeeName: user.employee ? user.employee.name : null,
  };
}

async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = (body.email || '').trim().toLowerCase();
  const password = body.password || '';
  if (!email || !password) {
    return json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email }, include: { employee: true } });
  // Constant-shaped response whether or not the user exists, to avoid
  // leaking which emails are registered.
  const invalid = () => json({ error: 'Invalid email or password' }, { status: 401 });
  if (!user) return invalid();

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await logAudit({ session: null, action: 'LOGIN_FAILED', targetType: 'User', targetId: user.id, detail: { email } });
    return invalid();
  }

  const token = createSessionToken(user);
  await logAudit({ session: { uid: user.id, email: user.email }, action: 'LOGIN_SUCCESS', targetType: 'User', targetId: user.id });

  return json({ user: publicUser(user) }, {
    status: 200,
    headers: { 'Set-Cookie': sessionCookieHeader(token) },
  });
}

module.exports = { POST };
