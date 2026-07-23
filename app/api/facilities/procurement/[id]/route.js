const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { PROCUREMENT_DECIDE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, PROCUREMENT_DECIDE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!['APPROVED', 'DENIED'].includes(body.status)) {
    return json({ error: "status must be 'APPROVED' or 'DENIED'" }, { status: 400 });
  }

  const existing = await prisma.procurementRequest.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'PENDING') return json({ error: 'This request has already been decided' }, { status: 400 });

  const request_ = await prisma.procurementRequest.update({
    where: { id: params.id },
    data: { status: body.status, decidedByUserId: session.uid, decidedAt: new Date() },
  });

  await logAudit({
    session,
    action: body.status === 'APPROVED' ? 'PROCUREMENT_APPROVED' : 'PROCUREMENT_DENIED',
    targetType: 'ProcurementRequest',
    targetId: request_.id,
    detail: { item: request_.item },
  });

  return json({ request: { id: request_.id, status: request_.status, decidedAt: request_.decidedAt } });
}

module.exports = { PATCH };
