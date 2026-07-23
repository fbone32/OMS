const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { LEAVE_DECIDE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function entryDate(entry) {
  const d = new Date(entry.weekStart);
  d.setDate(d.getDate() + entry.dayOfWeek);
  return d;
}

// Approving a leave request must reflect in scheduling: the employee becomes
// unavailable for shifts in the approved date range, so any roster rows
// already assigned to them in that window are cleared back to a gap that
// needs reassignment.
async function unassignShiftsDuringLeave(employeeId, startDate, endDate) {
  const candidates = await prisma.shiftRosterEntry.findMany({ where: { employeeId } });
  const toClear = candidates.filter((e) => {
    const d = entryDate(e);
    return d >= startDate && d <= endDate && !e.published;
  });
  const publishedButOverlapping = candidates.filter((e) => {
    const d = entryDate(e);
    return d >= startDate && d <= endDate && e.published;
  });
  if (toClear.length) {
    await prisma.shiftRosterEntry.updateMany({
      where: { id: { in: toClear.map((e) => e.id) } },
      data: { employeeId: null },
    });
  }
  return { clearedCount: toClear.length, publishedConflictCount: publishedButOverlapping.length };
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, LEAVE_DECIDE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const decision = body.status;
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return json({ error: 'status must be APPROVED or REJECTED' }, { status: 400 });
  }

  const leave = await prisma.leaveRequest.update({
    where: { id: params.id },
    data: { status: decision, decidedByUserId: session.uid, decidedAt: new Date() },
    include: { employee: true },
  }).catch(() => null);
  if (!leave) return json({ error: 'Not found' }, { status: 404 });

  let scheduling = null;
  if (decision === 'APPROVED') {
    scheduling = await unassignShiftsDuringLeave(leave.employeeId, leave.startDate, leave.endDate);
  }

  await logAudit({
    session,
    action: decision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    targetType: 'LeaveRequest',
    targetId: leave.id,
    detail: { employee: leave.employee.name, scheduling },
  });

  return json({
    request: {
      id: leave.id, employeeId: leave.employeeId, name: leave.employee.name, type: leave.type,
      startDate: leave.startDate, endDate: leave.endDate, days: leave.days, status: leave.status,
    },
    scheduling,
  });
}

module.exports = { PATCH };
