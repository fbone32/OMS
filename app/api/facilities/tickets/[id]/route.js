const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { TICKETS_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, TICKETS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!['IN_PROGRESS', 'DONE'].includes(body.status)) {
    return json({ error: "status must be 'IN_PROGRESS' (start work) or 'DONE' (mark fixed)" }, { status: 400 });
  }

  const existing = await prisma.iTTicket.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status === 'DONE') return json({ error: 'Ticket is already closed' }, { status: 400 });

  const data = { status: body.status };
  if (body.status === 'IN_PROGRESS') data.startedAt = new Date();
  if (body.status === 'DONE') {
    data.closedAt = new Date();
    data.resolvedByUserId = session.uid;
  }

  const ticket = await prisma.iTTicket.update({ where: { id: params.id }, data });

  await logAudit({
    session,
    action: body.status === 'DONE' ? 'TICKET_CLOSED' : 'TICKET_STARTED',
    targetType: 'ITTicket',
    targetId: ticket.id,
    detail: { title: ticket.title },
  });

  return json({ ticket: { id: ticket.id, status: ticket.status, startedAt: ticket.startedAt, closedAt: ticket.closedAt } });
}

module.exports = { PATCH };
