const { createSessionToken, sessionCookieHeader } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { verifyCredentials } = require('../../../../lib/credentials');

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
    // Matches the shape /api/auth/me returns — the frontend needs these to
    // build a real identity for any account that isn't one of the original
    // seeded demo personas (see Component.resolveRole in public/index.html).
    employeeBranch: user.employee ? user.employee.branch : null,
    employeeJobTitle: user.employee ? user.employee.jobTitle : null,
  };
}

// Both response helpers are deliberately generic and non-leaky: neither
// reveals whether an email is registered, and neither reveals implementation
// detail. The two ARE distinguishable to a human (a real bad password says
// "try again"; an infra failure says "try again in a moment"), but that
// distinction never depends on account existence — only on whether we could
// even complete the credential check.
const invalidCredentials = () => json({ error: 'Invalid email or password' }, { status: 401 });
const serviceUnavailable = () =>
  json({ error: 'Something went wrong on our end. Please try again in a moment.' }, { status: 503 });

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

  let result;
  try {
    result = await verifyCredentials(email, password);
  } catch (err) {
    // Genuine infrastructure failure (DB unreachable, table doesn't exist
    // because migrations never ran, etc.) — NOT a wrong password. Logged
    // with a distinct action tag so it never gets collapsed into normal
    // LOGIN_FAILED metrics/monitoring, even though the client response is
    // still generic.
    console.error('[auth/login] infra error verifying credentials:', err);
    await logAudit({
      session: null,
      action: 'LOGIN_ERROR_INFRA',
      targetType: 'User',
      targetId: null,
      detail: { email, error: String((err && err.message) || err) },
    });
    return serviceUnavailable();
  }

  if (!result.ok) {
    // Covers both "no such user" and "wrong password" — identical response,
    // and only logged with the target user id when we actually found one.
    await logAudit({
      session: null,
      action: 'LOGIN_FAILED',
      targetType: 'User',
      targetId: result.user ? result.user.id : null,
      detail: { email },
    });
    return invalidCredentials();
  }

  const user = result.user;
  let token;
  try {
    token = createSessionToken(user);
  } catch (err) {
    // e.g. SESSION_SECRET not set in this environment — again an infra/
    // config problem, not the user's fault, and not a wrong password.
    console.error('[auth/login] failed to create session token:', err);
    await logAudit({
      session: null,
      action: 'LOGIN_ERROR_INFRA',
      targetType: 'User',
      targetId: user.id,
      detail: { email, error: String((err && err.message) || err) },
    });
    return serviceUnavailable();
  }

  await logAudit({ session: { uid: user.id, email: user.email }, action: 'LOGIN_SUCCESS', targetType: 'User', targetId: user.id });

  return json({ user: publicUser(user) }, {
    status: 200,
    headers: { 'Set-Cookie': sessionCookieHeader(token) },
  });
}

module.exports = { POST };
