const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { ASSETS_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, ASSETS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.employeeId) return json({ error: 'employeeId is required' }, { status: 400 });

  const existing = await prisma.asset.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'ASSIGNED') {
    return json({ error: 'Asset is already assigned — return it before reassigning' }, { status: 409 });
  }
  if (existing.status === 'RETIRED') {
    return json({ error: 'Asset is retired and cannot be assigned' }, { status: 409 });
  }

  const employee = await prisma.employee.findUnique({ where: { id: body.employeeId } });
  if (!employee) return json({ error: 'Employee not found' }, { status: 400 });

  const asset = await prisma.asset.update({
    where: { id: params.id },
    data: {
      status: 'ASSIGNED',
      assignedToEmployeeId: employee.id,
      assignedAt: new Date(),
      assignedByUserId: session.uid,
      returnedAt: null,
    },
    include: { assignedTo: true },
  });

  await logAudit({
    session,
    action: 'ASSET_ASSIGNED',
    targetType: 'Asset',
    targetId: asset.id,
    detail: { tag: asset.tag, name: asset.name, assignedTo: employee.name },
  });

  return json({ asset: { id: asset.id, status: asset.status, assignedToEmployeeId: asset.assignedToEmployeeId, assignedToName: asset.assignedTo.name, assignedAt: asset.assignedAt } });
}

module.exports = { POST };
