const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { SCHEDULING_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, SCHEDULING_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const entry = await prisma.shiftRosterEntry.findUnique({ where: { id: body.id } });
  if (!entry) return json({ error: 'Not found' }, { status: 404 });
  if (entry.published) return json({ error: 'This roster is published and locked — cannot edit' }, { status: 400 });

  // Auto-assign the next active employee at this branch who isn't already on
  // this day's roster (mirrors the "+ Assign staff" one-click flow in the
  // existing demo UI, now against real data).
  const employees = await prisma.employee.findMany({ where: { branch: entry.branch, active: true }, orderBy: { id: 'asc' } });
  const sameDay = await prisma.shiftRosterEntry.findMany({
    where: { branch: entry.branch, weekStart: entry.weekStart, dayOfWeek: entry.dayOfWeek },
  });
  const busy = new Set(sameDay.map((e) => e.employeeId).filter(Boolean));
  const candidate = employees.find((e) => !busy.has(e.id)) || employees[0];
  if (!candidate) return json({ error: 'No employees available at this branch' }, { status: 400 });

  const updated = await prisma.shiftRosterEntry.update({
    where: { id: entry.id },
    data: { employeeId: candidate.id, createdByUserId: session.uid },
  });

  await logAudit({ session, action: 'ROSTER_ASSIGNED', targetType: 'ShiftRosterEntry', targetId: updated.id, detail: { employeeId: candidate.id } });

  return json({ entry: updated, employeeName: candidate.name.split(' ')[0] });
}

module.exports = { POST };
