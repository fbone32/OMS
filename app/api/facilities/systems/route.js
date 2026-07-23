// Branch systems status (Phase 3 — IT & Facilities "systems uptime"). There
// is no real infra here to poll for uptime, so this is a real, IT-maintained
// record IT & Facilities updates by hand — genuinely real data (a row IT
// wrote), just not automated monitoring (which is honestly out of scope for
// this deployment; see SystemStatus model comment in schema.prisma).
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { SYSTEMS_VIEW, SYSTEMS_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(s) {
  return { id: s.id, name: s.name, detail: s.detail, status: s.status, updatedAt: s.updatedAt };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, SYSTEMS_VIEW);
  if (errorResponse) return errorResponse;

  const systems = await prisma.systemStatus.findMany({ orderBy: { name: 'asc' } });
  return json({ systems: systems.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, SYSTEMS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.name) return json({ error: 'name is required' }, { status: 400 });

  const existing = await prisma.systemStatus.findUnique({ where: { name: body.name } });
  if (existing) return json({ error: `${body.name} is already tracked` }, { status: 409 });

  const status = body.status && ['ONLINE', 'DEGRADED', 'OFFLINE'].includes(body.status) ? body.status : 'ONLINE';
  const system = await prisma.systemStatus.create({
    data: { name: body.name, detail: body.detail || null, status, updatedByUserId: session.uid },
  });

  await logAudit({ session, action: 'SYSTEM_ADDED', targetType: 'SystemStatus', targetId: system.id, detail: { name: system.name } });

  return json({ system: serialize(system) }, { status: 201 });
}

module.exports = { GET, POST };
