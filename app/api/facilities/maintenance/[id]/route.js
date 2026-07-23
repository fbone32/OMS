const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { MAINTENANCE_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, MAINTENANCE_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.status !== 'DONE') return json({ error: "Only status: 'DONE' is supported here" }, { status: 400 });

  const existing = await prisma.maintenanceTask.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'DONE') return json({ error: 'Already marked done' }, { status: 400 });

  const task = await prisma.maintenanceTask.update({
    where: { id: params.id },
    data: { status: 'DONE', completedAt: new Date() },
  });

  await logAudit({ session, action: 'MAINTENANCE_COMPLETED', targetType: 'MaintenanceTask', targetId: task.id, detail: { task: task.task } });

  return json({ task: { id: task.id, status: task.status, completedAt: task.completedAt } });
}

module.exports = { PATCH };
