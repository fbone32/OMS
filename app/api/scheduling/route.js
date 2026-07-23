const { prisma } = require('../../../lib/db');
const { getSession, unauthorized, forbidden } = require('../../../lib/auth');
const { SCHEDULING_VIEW } = require('../../../lib/roles');
const { mondayOf, ensureWeekRows } = require('../../../lib/scheduling');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const weekStart = mondayOf(new Date());

  if (url.searchParams.get('mine') === '1') {
    if (!session.employeeId) return json({ weekStart, entries: [] });
    const entries = await prisma.shiftRosterEntry.findMany({
      where: { employeeId: session.employeeId, weekStart },
      orderBy: [{ dayOfWeek: 'asc' }, { shiftType: 'asc' }],
    });
    return json({ weekStart, entries });
  }

  if (!SCHEDULING_VIEW.includes(session.role)) return forbidden();

  const branch = url.searchParams.get('branch');
  if (!branch) return json({ error: 'branch query param is required' }, { status: 400 });

  const rows = await ensureWeekRows(prisma, branch, weekStart);
  const withNames = await prisma.shiftRosterEntry.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { employee: true },
    orderBy: [{ dayOfWeek: 'asc' }, { shiftType: 'asc' }],
  });
  const published = withNames.length > 0 && withNames.every((r) => r.published);

  return json({
    branch,
    weekStart,
    published,
    entries: withNames.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      shiftType: r.shiftType,
      employeeId: r.employeeId,
      employeeName: r.employee ? r.employee.name.split(' ')[0] : null,
      published: r.published,
    })),
  });
}

module.exports = { GET };
