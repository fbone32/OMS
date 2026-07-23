// Marks an assigned asset as returned — the "returns on exit" half of Asset
// Tracking. Clears the assignment but the asset row (and audit trail) keeps
// the full history of who last had it.
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

const VALID_CONDITIONS = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'RETIRED'];

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, ASSETS_MANAGE);
  if (errorResponse) return errorResponse;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional — a return with no condition change is fine.
  }

  const existing = await prisma.asset.findUnique({ where: { id: params.id }, include: { assignedTo: true } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'ASSIGNED') {
    return json({ error: 'Asset is not currently assigned' }, { status: 409 });
  }
  if (body.condition !== undefined && !VALID_CONDITIONS.includes(body.condition)) {
    return json({ error: `condition must be one of: ${VALID_CONDITIONS.join(', ')}` }, { status: 400 });
  }

  const returnedFromName = existing.assignedTo ? existing.assignedTo.name : null;

  const asset = await prisma.asset.update({
    where: { id: params.id },
    data: {
      status: 'IN_STORAGE',
      assignedToEmployeeId: null,
      returnedAt: new Date(),
      condition: body.condition || existing.condition,
    },
  });

  await logAudit({
    session,
    action: 'ASSET_RETURNED',
    targetType: 'Asset',
    targetId: asset.id,
    detail: { tag: asset.tag, name: asset.name, returnedFrom: returnedFromName, condition: asset.condition },
  });

  return json({ asset: { id: asset.id, status: asset.status, condition: asset.condition, returnedAt: asset.returnedAt } });
}

module.exports = { POST };
