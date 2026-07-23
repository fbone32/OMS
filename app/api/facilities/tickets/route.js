// IT ticket queue (Phase 3 — IT & Facilities). Mirrors app/api/incidents.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { TICKETS_VIEW, TICKETS_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(t) {
  return {
    id: t.id,
    title: t.title,
    branch: t.branch,
    priority: t.priority,
    status: t.status,
    detail: t.detail,
    reportedByName: t.reportedBy ? t.reportedBy.email : null,
    startedAt: t.startedAt,
    resolvedByName: t.resolvedBy ? t.resolvedBy.email : null,
    closedAt: t.closedAt,
    createdAt: t.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, TICKETS_VIEW);
  if (errorResponse) return errorResponse;

  const tickets = await prisma.iTTicket.findMany({
    include: { reportedBy: true, resolvedBy: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return json({ tickets: tickets.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, TICKETS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { title, branch } = body;
  if (!title || !branch) return json({ error: 'title and branch are required' }, { status: 400 });
  const priority = body.priority && ['LOW', 'MEDIUM', 'HIGH'].includes(body.priority) ? body.priority : 'MEDIUM';

  const ticket = await prisma.iTTicket.create({
    data: {
      title,
      branch,
      priority,
      detail: body.detail || null,
      reportedByUserId: session.uid,
    },
    include: { reportedBy: true, resolvedBy: true },
  });

  await logAudit({ session, action: 'TICKET_LOGGED', targetType: 'ITTicket', targetId: ticket.id, detail: { title, branch, priority } });

  return json({ ticket: serialize(ticket) }, { status: 201 });
}

module.exports = { GET, POST };
