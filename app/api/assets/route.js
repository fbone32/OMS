// Asset register (Phase 3 — Asset Tracking): laptops/phones/equipment,
// tagged and assigned to staff. Mirrors app/api/incidents/route.js's shape.
const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { ASSETS_VIEW, ASSETS_MANAGE } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(a) {
  return {
    id: a.id,
    name: a.name,
    tag: a.tag,
    category: a.category,
    branch: a.branch,
    condition: a.condition,
    status: a.status,
    assignedToEmployeeId: a.assignedToEmployeeId,
    assignedToName: a.assignedTo ? a.assignedTo.name : null,
    assignedAt: a.assignedAt,
    returnedAt: a.returnedAt,
    notes: a.notes,
    createdAt: a.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, ASSETS_VIEW);
  if (errorResponse) return errorResponse;

  const assets = await prisma.asset.findMany({
    include: { assignedTo: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return json({ assets: assets.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, ASSETS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { name, tag, category, branch } = body;
  if (!name || !tag || !category || !branch) {
    return json({ error: 'name, tag, category and branch are required' }, { status: 400 });
  }

  const existingTag = await prisma.asset.findUnique({ where: { tag } });
  if (existingTag) return json({ error: `Asset tag ${tag} is already registered` }, { status: 409 });

  const asset = await prisma.asset.create({
    data: {
      name,
      tag,
      category,
      branch,
      condition: body.condition && ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'RETIRED'].includes(body.condition) ? body.condition : 'GOOD',
      registeredByUserId: session.uid,
    },
    include: { assignedTo: true },
  });

  await logAudit({ session, action: 'ASSET_REGISTERED', targetType: 'Asset', targetId: asset.id, detail: { name, tag, category, branch } });

  return json({ asset: serialize(asset) }, { status: 201 });
}

module.exports = { GET, POST };
