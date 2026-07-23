// Update an asset's condition/notes (e.g. "Needs repair" after a fault
// report) — a lighter-weight edit than the assign/return lifecycle actions,
// which live in their own sibling routes so each gets its own clear audit
// action name.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { ASSETS_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

const VALID_CONDITIONS = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'RETIRED'];

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, ASSETS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const existing = await prisma.asset.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });

  const data = {};
  if (body.condition !== undefined) {
    if (!VALID_CONDITIONS.includes(body.condition)) {
      return json({ error: `condition must be one of: ${VALID_CONDITIONS.join(', ')}` }, { status: 400 });
    }
    data.condition = body.condition;
  }
  if (body.notes !== undefined) data.notes = body.notes || null;
  if (Object.keys(data).length === 0) return json({ error: 'Nothing to update' }, { status: 400 });

  const asset = await prisma.asset.update({ where: { id: params.id }, data, include: { assignedTo: true } });

  await logAudit({ session, action: 'ASSET_UPDATED', targetType: 'Asset', targetId: asset.id, detail: { tag: asset.tag, ...data } });

  return json({ asset: { id: asset.id, condition: asset.condition, notes: asset.notes } });
}

module.exports = { PATCH };
