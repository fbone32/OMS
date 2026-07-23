const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { sendEmail } = require('../../../../lib/email');
const { renderEmailTemplate } = require('../../../../lib/email-templates');
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

  // Notify the employee by real email if their account has one linked (an
  // Employee row isn't guaranteed to have a User login — see Employee/User's
  // optional 1:1 relation) — a genuine "PO/leave-approval notification" per
  // the brief's integration requirements, using the same lib/email helper as
  // every other notification in this app.
  let emailSent = null;
  const employeeUser = await prisma.user.findUnique({ where: { employeeId: leave.employeeId } });
  if (employeeUser) {
    const approved = decision === 'APPROVED';
    const result = await sendEmail({
      to: employeeUser.email,
      subject: `Your ${leave.type.toLowerCase()} leave request was ${approved ? 'approved' : 'rejected'}`,
      html: renderEmailTemplate('leave-decision', {
        EMPLOYEE_FIRST_NAME: leave.employee.name.split(' ')[0],
        DECISION_WORD: approved ? 'approved' : 'rejected',
        BANNER_BG: approved ? '#E7F1EC' : '#FBECEC',
        BANNER_FG: approved ? '#2E6B4F' : '#9B2C2C',
        BANNER_LABEL: approved ? 'Approved' : 'Rejected',
        LEAVE_TYPE: leave.type,
        LEAVE_DATES: `${new Date(leave.startDate).toLocaleDateString('en-GB')} – ${new Date(leave.endDate).toLocaleDateString('en-GB')}`,
        LEAVE_DAYS: `${leave.days} day${leave.days === 1 ? '' : 's'}`,
      }),
      text: `Your ${leave.type} leave request (${leave.days} day(s)) was ${approved ? 'approved' : 'rejected'}.`,
    });
    emailSent = result.ok;
  }

  await logAudit({
    session,
    action: decision === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    targetType: 'LeaveRequest',
    targetId: leave.id,
    detail: { employee: leave.employee.name, scheduling, emailSent },
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
