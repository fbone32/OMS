// Lightweight, public, read-only ops health check. Exists so this app's
// bootstrap state (Postgres reachable, migrations applied, demo data
// seeded) can be confirmed against the REAL deployed environment with a
// plain GET — the exact failure mode this route exists to catch is "the
// build succeeded and the site loads, but every Prisma-backed request
// fails because migrations were never run against production," which is
// precisely what shipped before this route existed.
//
// GET /api/health            -> DB connectivity + row counts only.
// GET /api/health?deep=1     -> also runs one real, end-to-end credential
//                               check against a fixed, always-seeded demo
//                               account (see lib/demo-seed-constants.js).
//                               No caller-supplied email/password is ever
//                               accepted here — this proves the seeded demo
//                               login genuinely works without turning this
//                               route into a general-purpose login oracle.
const { prisma } = require('../../../lib/db');
const { verifyCredentials } = require('../../../lib/credentials');
const { SEED_PASSWORD, HEALTH_CHECK_DEMO_EMAIL } = require('../../../lib/demo-seed-constants');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const { searchParams } = new URL(request.url);
  const deep = searchParams.get('deep') === '1';

  const out = { ok: true, db: { connected: false }, timestamp: new Date().toISOString() };

  try {
    await prisma.$queryRaw`SELECT 1`;
    out.db.connected = true;
    const [userCount, employeeCount] = await Promise.all([
      prisma.user.count(),
      prisma.employee.count(),
    ]);
    out.db.userCount = userCount;
    out.db.employeeCount = employeeCount;
  } catch (err) {
    out.ok = false;
    out.db.connected = false;
    out.db.error = String((err && err.message) || err);
    console.error('[health] db check failed:', err);
    return json(out, { status: 503 });
  }

  if (deep) {
    try {
      const result = await verifyCredentials(HEALTH_CHECK_DEMO_EMAIL, SEED_PASSWORD);
      out.demoLogin = { checked: true, success: result.ok, role: result.ok ? result.user.role : null };
      if (!result.ok) out.ok = false;
    } catch (err) {
      out.ok = false;
      out.demoLogin = { checked: true, success: false, error: String((err && err.message) || err) };
      console.error('[health] deep demo-login check failed:', err);
    }
  }

  return json(out, { status: out.ok ? 200 : 503 });
}

module.exports = { GET };
