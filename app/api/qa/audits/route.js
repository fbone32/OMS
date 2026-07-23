const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { QA_VIEW, QA_ENTRY } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(a) {
  return {
    id: a.id,
    employeeId: a.employeeId,
    name: a.employee.name,
    jobTitle: a.employee.jobTitle,
    branch: a.employee.branch,
    ticketRef: a.ticketRef,
    score: a.score,
    note: a.note,
    createdAt: a.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, QA_VIEW);
  if (errorResponse) return errorResponse;

  const audits = await prisma.qaAudit.findMany({
    include: { employee: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return json({ audits: audits.map(serialize) });
}

// Not wired to a dedicated "Add audit" form — the existing Quality (QA)
// screen's agent-scorecards and recent-audits panels are read-only displays
// (no create control in the markup). Verified directly via curl instead,
// same as app/api/attendance/[id]'s correction endpoint.
async function POST(request) {
  const { session, errorResponse } = requireRole(request, QA_ENTRY);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { employeeId, ticketRef, score } = body;
  if (!employeeId || !ticketRef || score === undefined || score === null) {
    return json({ error: 'employeeId, ticketRef and score are required' }, { status: 400 });
  }
  const scoreNum = Number(score);
  if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
    return json({ error: 'score must be a number between 0 and 100' }, { status: 400 });
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return json({ error: 'Employee not found' }, { status: 400 });

  const audit = await prisma.qaAudit.create({
    data: { employeeId, ticketRef, score: Math.round(scoreNum), note: body.note || null, auditedByUserId: session.uid },
    include: { employee: true },
  });

  await logAudit({ session, action: 'QA_AUDIT_LOGGED', targetType: 'QaAudit', targetId: audit.id, detail: { employee: employee.name, ticketRef, score: audit.score } });

  return json({ audit: serialize(audit) }, { status: 201 });
}

module.exports = { GET, POST };
