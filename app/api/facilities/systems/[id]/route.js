const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { SYSTEMS_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

const VALID_STATUSES = ['ONLINE', 'DEGRADED', 'OFFLINE'];

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, SYSTEMS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(body.status)) {
    return json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const existing = await prisma.systemStatus.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });

  const system = await prisma.systemStatus.update({
    where: { id: params.id },
    data: { status: body.status, detail: body.detail !== undefined ? body.detail : existing.detail, updatedByUserId: session.uid },
  });

  await logAudit({ session, action: 'SYSTEM_STATUS_UPDATED', targetType: 'SystemStatus', targetId: system.id, detail: { name: system.name, status: system.status } });

  return json({ system: { id: system.id, status: system.status, detail: system.detail, updatedAt: system.updatedAt } });
}

module.exports = { PATCH };
