// Procurement requests (Phase 3 — IT & Facilities). IT & Facilities (and
// Director) can raise a request; only Director decides — matches the
// existing UI's `procApprover` flag, true only for the director persona.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { PROCUREMENT_VIEW, PROCUREMENT_REQUEST } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(p) {
  return {
    id: p.id,
    item: p.item,
    costLabel: p.costLabel,
    reason: p.reason,
    status: p.status,
    requestedByName: p.requestedBy ? p.requestedBy.email : null,
    decidedByName: p.decidedBy ? p.decidedBy.email : null,
    decidedAt: p.decidedAt,
    createdAt: p.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, PROCUREMENT_VIEW);
  if (errorResponse) return errorResponse;

  const requests = await prisma.procurementRequest.findMany({
    include: { requestedBy: true, decidedBy: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return json({ requests: requests.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, PROCUREMENT_REQUEST);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { item, costLabel, reason } = body;
  if (!item || !costLabel || !reason) return json({ error: 'item, costLabel and reason are required' }, { status: 400 });

  const created = await prisma.procurementRequest.create({
    data: { item, costLabel, reason, requestedByUserId: session.uid },
    include: { requestedBy: true, decidedBy: true },
  });

  await logAudit({ session, action: 'PROCUREMENT_REQUESTED', targetType: 'ProcurementRequest', targetId: created.id, detail: { item, costLabel } });

  return json({ request: serialize(created) }, { status: 201 });
}

module.exports = { GET, POST };
