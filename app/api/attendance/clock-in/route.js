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

// A shift starting after this local hour:minute counts as LATE. Kept simple
// (no per-branch shift templates in Phase 1 scope) — matches the 08:00 day
// shift start used throughout the existing demo.
const LATE_AFTER_HOUR = 8;
const LATE_AFTER_MINUTE = 15;

async function POST(request) {
  const session = getSession(request);
  if (!session) return unauthorized();
  if (!session.employeeId) return json({ error: 'Your account is not linked to an employee record' }, { status: 400 });

  const now = new Date();
  const day = startOfDay(now);
  const isLate = now.getHours() > LATE_AFTER_HOUR || (now.getHours() === LATE_AFTER_HOUR && now.getMinutes() > LATE_AFTER_MINUTE);

  const record = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: session.employeeId, date: day } },
    update: { clockIn: now, status: isLate ? 'LATE' : 'ON_TIME' },
    create: {
      employeeId: session.employeeId,
      date: day,
      clockIn: now,
      status: isLate ? 'LATE' : 'ON_TIME',
    },
  });

  await logAudit({ session, action: 'ATTENDANCE_CLOCK_IN', targetType: 'AttendanceRecord', targetId: record.id });

  return json({ record });
}

module.exports = { POST };
