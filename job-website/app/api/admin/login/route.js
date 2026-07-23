const crypto = require('crypto');
const { prisma } = require('../../../../lib/db');
const { createSessionToken, sessionCookieHeader } = require('../../../../lib/auth');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Phase 1 admin auth: a single shared HR admin account, credentials set via
// env vars (JOB_WEBSITE_ADMIN_EMAIL / JOB_WEBSITE_ADMIN_PASSWORD) and
// mirrored into a real AdminUser row on first login (so lastLoginAt is
// genuinely tracked). Rate-limited against brute force. Multi-admin/employer
// accounts are explicitly Phase 2 — see final report.
async function POST(request) {
  const ip = clientIp(request);
  const allowed = await checkRateLimit(`admin-login:${ip}`, { limit: 10, windowMs: 5 * 60_000 });
  if (!allowed) return json({ error: 'Too many login attempts — try again in a few minutes.' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const email = (body.email || '').trim().toLowerCase();
  const password = (body.password || '').toString();

  const expectedEmail = (process.env.JOB_WEBSITE_ADMIN_EMAIL || '').trim().toLowerCase();
  const expectedPassword = process.env.JOB_WEBSITE_ADMIN_PASSWORD || '';

  if (!expectedEmail || !expectedPassword) {
    console.error('[admin login] JOB_WEBSITE_ADMIN_EMAIL/PASSWORD not configured');
    return json({ error: 'Admin login is not configured on this deployment.' }, { status: 500 });
  }

  const emailOk = email.length > 0 && timingSafeStringEqual(email, expectedEmail);
  const passwordOk = password.length > 0 && timingSafeStringEqual(password, expectedPassword);
  if (!emailOk || !passwordOk) {
    return json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const admin = await prisma.adminUser.upsert({
    where: { email: expectedEmail },
    update: { lastLoginAt: new Date() },
    create: { email: expectedEmail, passwordHash: 'env-managed', lastLoginAt: new Date() },
  });

  const token = createSessionToken(admin);
  return new Response(JSON.stringify({ ok: true, email: admin.email }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader(token),
    },
  });
}

module.exports = { POST };
