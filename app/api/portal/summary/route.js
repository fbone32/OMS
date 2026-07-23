// Client Portal summary (Phase 4) — a client-scoped view of their own
// staffing, attendance, and QA/SLA status. This is the security boundary the
// brief requires be a REAL one, not a UI filter: when the caller is a CLIENT
// login, clientId is taken ONLY from the verified session (session.clientId,
// set at login from the User row — see lib/auth.js), never from a query
// param, so a client can never see another client's data even by crafting a
// request with a different client's id. Internal roles (Director/Business
// Development/Board Advisor) may pass ?clientId= to pick which client to
// view, matching the existing isPortal screen's multi-client selector.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { PORTAL_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function resolveClientId(request, session) {
  if (session.role === 'CLIENT') {
    // Server-enforced isolation: ALWAYS the session's own client, never the
    // query string, regardless of what a crafted request supplies.
    return session.clientId;
  }
  const url = new URL(request.url);
  const requested = url.searchParams.get('clientId');
  if (requested) return requested;
  const first = await prisma.client.findFirst({ orderBy: { createdAt: 'asc' } });
  return first ? first.id : null;
}

async function GET(request) {
  const { session, errorResponse } = requireRole(request, PORTAL_VIEW);
  if (errorResponse) return errorResponse;

  const clientId = await resolveClientId(request, session);
  if (!clientId) {
    return json({ client: null, roster: [], attendanceSummary: null, qaSummary: null, slaRows: [], contracts: [] });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    if (session.role === 'CLIENT') return json({ error: 'Not found' }, { status: 404 });
    return json({ client: null, roster: [], attendanceSummary: null, qaSummary: null, slaRows: [], contracts: [] });
  }
  // A client login whose own client row was somehow deleted/reassigned must
  // never fall through to seeing a DIFFERENT client's data.
  if (session.role === 'CLIENT' && client.id !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const staff = await prisma.employee.findMany({ where: { clientId: client.id }, orderBy: { name: 'asc' } });
  const staffIds = staff.map((e) => e.id);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [attendanceRows, qaAudits] = await Promise.all([
    staffIds.length
      ? prisma.attendanceRecord.findMany({ where: { employeeId: { in: staffIds }, date: { gte: thirtyDaysAgo } } })
      : Promise.resolve([]),
    staffIds.length ? prisma.qaAudit.findMany({ where: { employeeId: { in: staffIds } } }) : Promise.resolve([]),
  ]);

  const perEmployeeAttendance = {};
  for (const a of attendanceRows) {
    const bucket = (perEmployeeAttendance[a.employeeId] = perEmployeeAttendance[a.employeeId] || { total: 0, present: 0 });
    bucket.total += 1;
    if (a.status !== 'ABSENT') bucket.present += 1;
  }
  const perEmployeeQa = {};
  for (const q of qaAudits) {
    const bucket = (perEmployeeQa[q.employeeId] = perEmployeeQa[q.employeeId] || { count: 0, sum: 0 });
    bucket.count += 1;
    bucket.sum += q.score;
  }

  const roster = staff.map((e) => {
    const att = perEmployeeAttendance[e.id];
    const qa = perEmployeeQa[e.id];
    return {
      id: e.id,
      name: e.name,
      role: e.jobTitle,
      branch: e.branch,
      attendancePct: att && att.total ? Math.round((att.present / att.total) * 100) : null,
      qaAvg: qa && qa.count ? Math.round((qa.sum / qa.count) * 10) / 10 : null,
      active: e.active,
    };
  });

  const totalAttendance = attendanceRows.length;
  const presentAttendance = attendanceRows.filter((a) => a.status !== 'ABSENT').length;
  const attendancePct = totalAttendance ? Math.round((presentAttendance / totalAttendance) * 100) : null;
  const qaAvg = qaAudits.length ? Math.round((qaAudits.reduce((s, a) => s + a.score, 0) / qaAudits.length) * 10) / 10 : null;
  const slaTargetPct = client.slaTargetPct != null ? Number(client.slaTargetPct) : null;

  const contracts = await prisma.contract.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: 'desc' },
  });

  const clientsList =
    session.role === 'CLIENT'
      ? undefined // a client login never sees the list of other clients, not even names
      : (await prisma.client.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, name: true } }));

  return json({
    client: {
      id: client.id,
      name: client.name,
      region: client.region,
      industry: client.industry,
      currency: client.currency,
      slaTargetPct,
      status: client.status,
      health: client.health,
    },
    roster,
    attendanceSummary: { pct: attendancePct, totalMarked: totalAttendance, staffCount: staff.length },
    qaSummary: { avg: qaAvg, auditCount: qaAudits.length },
    slaRows: [
      attendancePct != null
        ? { name: 'Attendance', value: attendancePct, target: slaTargetPct != null ? slaTargetPct : 95, unit: '%' }
        : null,
      qaAvg != null ? { name: 'QA score', value: qaAvg, target: 90, unit: 'pts' } : null,
    ].filter(Boolean),
    contracts: contracts.map((c) => ({
      id: c.id,
      title: c.title,
      value: c.value != null ? Number(c.value) : null,
      currency: c.currency,
      status: c.status,
      startDate: c.startDate,
      renewalDueDate: c.renewalDueDate,
    })),
    clientsList,
  });
}

module.exports = { GET };
