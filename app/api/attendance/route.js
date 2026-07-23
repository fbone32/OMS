const { prisma } = require('../../../lib/db');
const { getSession, unauthorized, forbidden } = require('../../../lib/auth');
const { ATTENDANCE_VIEW } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(r) {
  return {
    id: r.id,
    employeeId: r.employeeId,
    name: r.employee.name,
    jobTitle: r.employee.jobTitle,
    branch: r.employee.branch,
    date: r.date,
    clockIn: r.clockIn,
    clockOut: r.clockOut,
    status: r.status,
    correctionNote: r.correctionNote,
  };
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const day = startOfDay(dateParam ? new Date(dateParam) : new Date());

  if (url.searchParams.get('mine') === '1') {
    if (!session.employeeId) return json({ records: [] });
    const records = await prisma.attendanceRecord.findMany({
      where: { employeeId: session.employeeId },
      include: { employee: true },
      orderBy: { date: 'desc' },
      take: 14,
    });
    return json({ records: records.map(serialize) });
  }

  if (!ATTENDANCE_VIEW.includes(session.role)) return forbidden();

  const records = await prisma.attendanceRecord.findMany({
    where: { date: day },
    include: { employee: true },
    orderBy: { employee: { name: 'asc' } },
  });
  return json({ records: records.map(serialize), date: day });
}

module.exports = { GET };
