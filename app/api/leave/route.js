const { prisma } = require('../../../lib/db');
const { getSession, unauthorized, forbidden } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { LEAVE_DECIDE } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(l) {
  return {
    id: l.id,
    employeeId: l.employeeId,
    name: l.employee.name,
    branch: l.employee.branch,
    type: l.type,
    startDate: l.startDate,
    endDate: l.endDate,
    days: l.days,
    status: l.status,
    reason: l.reason,
    decidedAt: l.decidedAt,
  };
}

async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  if (url.searchParams.get('mine') === '1') {
    if (!session.employeeId) return json({ requests: [] });
    const rows = await prisma.leaveRequest.findMany({
      where: { employeeId: session.employeeId },
      include: { employee: true },
      orderBy: { createdAt: 'desc' },
    });
    return json({ requests: rows.map(serialize) });
  }

  if (!LEAVE_DECIDE.includes(session.role)) return forbidden();
  const rows = await prisma.leaveRequest.findMany({
    include: { employee: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return json({ requests: rows.map(serialize) });
}

async function POST(request) {
  const session = getSession(request);
  if (!session) return unauthorized();
  if (!session.employeeId) return json({ error: 'Your account is not linked to an employee record' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { type, startDate, endDate, reason } = body;
  if (!type || !startDate || !endDate) {
    return json({ error: 'type, startDate and endDate are required' }, { status: 400 });
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

  const leave = await prisma.leaveRequest.create({
    data: { employeeId: session.employeeId, type, startDate: start, endDate: end, days, reason: reason || null },
    include: { employee: true },
  });

  await logAudit({ session, action: 'LEAVE_REQUESTED', targetType: 'LeaveRequest', targetId: leave.id, detail: { type, days } });

  return json({ request: serialize(leave) }, { status: 201 });
}

module.exports = { GET, POST };
