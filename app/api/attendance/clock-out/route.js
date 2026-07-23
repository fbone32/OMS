const { prisma } = require('../../../../lib/db');
const { getSession, unauthorized } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function POST(request) {
  const session = getSession(request);
  if (!session) return unauthorized();
  if (!session.employeeId) return json({ error: 'Your account is not linked to an employee record' }, { status: 400 });

  const now = new Date();
  const day = startOfDay(now);

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: session.employeeId, date: day } },
  });
  if (!existing) return json({ error: 'You have not clocked in today' }, { status: 400 });

  const record = await prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: { clockOut: now },
  });

  await logAudit({ session, action: 'ATTENDANCE_CLOCK_OUT', targetType: 'AttendanceRecord', targetId: record.id });

  return json({ record });
}

module.exports = { POST };
