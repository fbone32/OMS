// Board Dashboard summary (Phase 3). Read-only, company-wide *aggregates
// only* — deliberately no per-employee detail — for the Director and the
// Board Advisor (see lib/roles.js BOARD_VIEW). Reuses the exact same
// attendance/QA aggregate math as app/api/kpi/scorecard/route.js so the two
// screens never quietly disagree.
//
// Revenue/SLA/active-client figures are NOT computed here — there is no
// Client (Phase 4 Sales & CRM) entity or billing data yet to compute them
// from honestly, so the frontend keeps showing those clearly as
// placeholders rather than this route fabricating a number behind a "real"
// API response (same judgment call as kpi/scorecard's own comment).
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { BOARD_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const { errorResponse } = requireRole(request, BOARD_VIEW);
  if (errorResponse) return errorResponse;

  const [
    headcount,
    attendance,
    qaAudits,
    openIncidents,
    totalIncidents,
    openOpenings,
    candidatesInPipeline,
    trainingTotal,
    trainingCompleted,
  ] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.attendanceRecord.findMany({ select: { status: true } }),
    prisma.qaAudit.findMany({ select: { score: true } }),
    prisma.incident.count({ where: { status: 'OPEN' } }),
    prisma.incident.count(),
    prisma.jobOpening.count({ where: { status: 'OPEN' } }),
    prisma.candidate.count({ where: { stage: { notIn: ['HIRED', 'REJECTED'] } } }),
    prisma.trainingCompletion.count(),
    prisma.trainingCompletion.count({ where: { status: 'COMPLETED' } }),
  ]);

  const totalMarked = attendance.length;
  const present = attendance.filter((a) => a.status !== 'ABSENT').length;
  const attendancePct = totalMarked ? Math.round((present / totalMarked) * 100) : null;
  const avgQa = qaAudits.length ? Math.round((qaAudits.reduce((s, a) => s + a.score, 0) / qaAudits.length) * 10) / 10 : null;
  const trainingCompletionPct = trainingTotal ? Math.round((trainingCompleted / trainingTotal) * 100) : null;

  return json({
    headcount,
    attendancePct,
    avgQa,
    openIncidents,
    totalIncidents,
    recruitment: { openOpenings, candidatesInPipeline },
    trainingCompletionPct,
  });
}

module.exports = { GET };
