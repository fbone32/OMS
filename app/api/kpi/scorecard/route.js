// Executive KPI Scorecard — real, computed data only for the metrics Phase 1
// (+ this Phase's QaAudit/Incident) can genuinely support: attendance rate
// and QA score, plus a per-employee composite performance score built the
// same way the existing KPI screen's UI already describes it ("Score = 40%
// QA + 30% Attendance + 20% Punctuality + 10% Conduct"). Client-facing SLA,
// ticket volume and revenue figures are NOT computed here — there is no
// Client (Phase 3/4) or ticketing data yet to compute them from honestly, so
// the frontend keeps showing those as clearly-labelled placeholders rather
// than this route fabricating a number behind a "real" API response.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { KPI_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Incidents count against the "conduct" component of the score — 10 points
// off per HIGH-severity incident, 5 per MEDIUM/LOW, floored at 0. No
// incidents at all (the common case) scores a clean 100.
function conductScore(incidents) {
  let penalty = 0;
  for (const inc of incidents) penalty += inc.severity === 'HIGH' ? 10 : 5;
  return Math.max(0, 100 - penalty);
}

async function GET(request) {
  const { errorResponse } = requireRole(request, KPI_VIEW);
  if (errorResponse) return errorResponse;

  const [targets, employees, attendance, qaAudits, incidents] = await Promise.all([
    prisma.kpiTarget.findMany(),
    prisma.employee.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.attendanceRecord.findMany(),
    prisma.qaAudit.findMany(),
    prisma.incident.findMany(),
  ]);

  const targetMap = {};
  targets.forEach((t) => { targetMap[t.metricKey] = Number(t.targetValue); });

  const totalMarked = attendance.length;
  const onTime = attendance.filter((a) => a.status === 'ON_TIME').length;
  const late = attendance.filter((a) => a.status === 'LATE').length;
  const attendancePct = totalMarked ? Math.round(((onTime + late) / totalMarked) * 100) : null;
  const avgQa = qaAudits.length ? Math.round((qaAudits.reduce((s, a) => s + a.score, 0) / qaAudits.length) * 10) / 10 : null;

  const byEmployee = (list, key) => {
    const map = {};
    for (const row of list) {
      (map[row[key]] = map[row[key]] || []).push(row);
    }
    return map;
  };
  const attByEmp = byEmployee(attendance, 'employeeId');
  const qaByEmp = byEmployee(qaAudits, 'employeeId');
  const incByEmp = byEmployee(incidents, 'employeeId');

  const employeeScores = employees.map((e) => {
    const empAtt = attByEmp[e.id] || [];
    const empQa = qaByEmp[e.id] || [];
    const empInc = incByEmp[e.id] || [];
    const attTotal = empAtt.length;
    const attOnTime = empAtt.filter((a) => a.status === 'ON_TIME').length;
    const attPresent = empAtt.filter((a) => a.status !== 'ABSENT').length;
    // No data defaults to a neutral 100 (nothing negative on record yet) —
    // a brand-new employee isn't penalised for lacking a track record.
    const attendanceComponent = attTotal ? Math.round((attPresent / attTotal) * 100) : 100;
    const punctualityComponent = attTotal ? Math.round((attOnTime / attTotal) * 100) : 100;
    const qaComponent = empQa.length ? Math.round((empQa.reduce((s, a) => s + a.score, 0) / empQa.length) * 10) / 10 : 100;
    const conductComponent = conductScore(empInc);
    const score = Math.round(qaComponent * 0.4 + attendanceComponent * 0.3 + punctualityComponent * 0.2 + conductComponent * 0.1);
    return {
      employeeId: e.id,
      name: e.name,
      jobTitle: e.jobTitle,
      branch: e.branch,
      score,
      parts: {
        qa: qaComponent,
        attendance: attendanceComponent,
        punctuality: punctualityComponent,
        conduct: conductComponent,
      },
      qaAuditCount: empQa.length,
      attendanceRecordCount: attTotal,
      incidentCount: empInc.length,
    };
  });

  const teamAvg = employeeScores.length
    ? Math.round((employeeScores.reduce((s, e) => s + e.score, 0) / employeeScores.length) * 10) / 10
    : null;

  return json({
    targets: targets.map((t) => ({ metricKey: t.metricKey, label: t.label, targetValue: Number(t.targetValue), unit: t.unit })),
    actuals: { attendancePct, avgQa },
    employeeScores,
    teamAvg,
  });
}

module.exports = { GET };
