const { prisma } = require('../../../../lib/db');
const { getSession, unauthorized, requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { TRAINING_VIEW, TRAINING_RECORD } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(tc) {
  return {
    id: tc.id,
    employeeId: tc.employeeId,
    name: tc.employee.name,
    branch: tc.employee.branch,
    courseId: tc.courseId,
    courseName: tc.course.name,
    cohortId: tc.cohortId,
    cohortName: tc.cohort ? tc.cohort.name : null,
    status: tc.status,
    completedAt: tc.completedAt,
  };
}

async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  if (url.searchParams.get('mine') === '1') {
    if (!session.employeeId) return json({ completions: [] });
    const rows = await prisma.trainingCompletion.findMany({
      where: { employeeId: session.employeeId },
      include: { employee: true, course: true, cohort: true },
      orderBy: { createdAt: 'desc' },
    });
    return json({ completions: rows.map(serialize) });
  }

  const { errorResponse } = requireRole(request, TRAINING_VIEW);
  if (errorResponse) return errorResponse;
  const rows = await prisma.trainingCompletion.findMany({
    include: { employee: true, course: true, cohort: true },
    orderBy: { createdAt: 'desc' },
  });
  return json({ completions: rows.map(serialize) });
}

// Records (creates or updates) one employee's completion status for a
// course. Not wired to a per-learner UI control — the existing Training
// screen's cohort/course panels show aggregate progress bars only, no
// per-employee "mark complete" row. Verified directly via curl instead, same
// as app/api/attendance/[id]'s correction endpoint.
async function POST(request) {
  const { session, errorResponse } = requireRole(request, TRAINING_RECORD);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { employeeId, courseId } = body;
  if (!employeeId || !courseId) return json({ error: 'employeeId and courseId are required' }, { status: 400 });

  const status = body.status || 'COMPLETED';
  if (!['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'].includes(status)) {
    return json({ error: 'Invalid status' }, { status: 400 });
  }
  const [employee, course] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.course.findUnique({ where: { id: courseId } }),
  ]);
  if (!employee) return json({ error: 'Employee not found' }, { status: 400 });
  if (!course) return json({ error: 'Course not found' }, { status: 400 });
  let cohortId = null;
  if (body.cohortId) {
    const cohort = await prisma.cohort.findUnique({ where: { id: body.cohortId } });
    if (!cohort) return json({ error: 'Cohort not found' }, { status: 400 });
    cohortId = cohort.id;
  }

  const data = {
    status,
    completedAt: status === 'COMPLETED' ? new Date() : null,
    recordedByUserId: session.uid,
    ...(cohortId ? { cohortId } : {}),
  };
  const completion = await prisma.trainingCompletion.upsert({
    where: { employeeId_courseId: { employeeId, courseId } },
    update: data,
    create: { employeeId, courseId, cohortId, status, completedAt: data.completedAt, recordedByUserId: session.uid },
    include: { employee: true, course: true, cohort: true },
  });

  await logAudit({
    session,
    action: 'TRAINING_COMPLETION_RECORDED',
    targetType: 'TrainingCompletion',
    targetId: completion.id,
    detail: { employee: employee.name, course: course.name, status },
  });

  return json({ completion: serialize(completion) }, { status: 201 });
}

module.exports = { GET, POST };
