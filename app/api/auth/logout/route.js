const { getSession, sessionCookieHeader } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');

async function POST(request) {
  const session = getSession(request);
  if (session) {
    await logAudit({ session, action: 'LOGOUT', targetType: 'User', targetId: session.uid });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(null, { clear: true }),
    },
  });
}

module.exports = { POST };
