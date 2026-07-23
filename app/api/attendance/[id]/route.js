const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { ATTENDANCE_CORRECT } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Supervisor / Ops Manager / Director correction endpoint. Not currently
// wired to a frontend control (the existing Attendance template has no
// correction UI element, and the brief calls for a data-source swap rather
// than adding new UI) — verified directly via curl instead. See final report.
async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, ATTENDANCE_CORRECT);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = { correctedByUserId: session.uid };
  if (body.clockIn !== undefined) data.clockIn = body.clockIn ? new Date(body.clockIn) : null;
  if (body.clockOut !== undefined) data.clockOut = body.clockOut ? new Date(body.clockOut) : null;
  if (body.status) data.status = body.status;
  if (body.correctionNote !== undefined) data.correctionNote = body.correctionNote;

  const record = await prisma.attendanceRecord.update({ where: { id: params.id }, data }).catch(() => null);
  if (!record) return json({ error: 'Not found' }, { status: 404 });

  await logAudit({ session, action: 'ATTENDANCE_CORRECTED', targetType: 'AttendanceRecord', targetId: record.id, detail: body });

  return json({ record });
}

module.exports = { PATCH };
