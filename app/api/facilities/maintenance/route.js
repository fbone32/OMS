// Maintenance schedule (Phase 3 — IT & Facilities).
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { MAINTENANCE_VIEW, MAINTENANCE_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(m) {
  return { id: m.id, task: m.task, location: m.location, dueLabel: m.dueLabel, status: m.status, completedAt: m.completedAt, createdAt: m.createdAt };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, MAINTENANCE_VIEW);
  if (errorResponse) return errorResponse;

  const tasks = await prisma.maintenanceTask.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] });
  return json({ tasks: tasks.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, MAINTENANCE_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { task, location, dueLabel } = body;
  if (!task || !location || !dueLabel) return json({ error: 'task, location and dueLabel are required' }, { status: 400 });

  const created = await prisma.maintenanceTask.create({
    data: { task, location, dueLabel, createdByUserId: session.uid },
  });

  await logAudit({ session, action: 'MAINTENANCE_SCHEDULED', targetType: 'MaintenanceTask', targetId: created.id, detail: { task, location, dueLabel } });

  return json({ task: serialize(created) }, { status: 201 });
}

module.exports = { GET, POST };
