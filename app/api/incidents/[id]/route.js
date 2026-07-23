const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { INCIDENTS_CLOSE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, INCIDENTS_CLOSE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.status !== 'CLOSED') {
    return json({ error: "Only status: 'CLOSED' is supported here" }, { status: 400 });
  }

  const existing = await prisma.incident.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'CLOSED') return json({ error: 'Already closed' }, { status: 400 });

  const incident = await prisma.incident.update({
    where: { id: params.id },
    data: {
      status: 'CLOSED',
      closedByUserId: session.uid,
      closedAt: new Date(),
      action: body.action !== undefined ? body.action : existing.action,
    },
    include: { employee: true },
  });

  await logAudit({ session, action: 'INCIDENT_CLOSED', targetType: 'Incident', targetId: incident.id, detail: { employee: incident.employee.name } });

  return json({ incident: { id: incident.id, status: incident.status, closedAt: incident.closedAt } });
}

module.exports = { PATCH };
