const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { INCIDENTS_VIEW, INCIDENTS_LOG } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Server-derived from IncidentType — the existing "Log incident" form has no
// severity selector, so this is the one place severity is decided, real but
// not user-entered.
const TYPE_SEVERITY = {
  LATENESS: 'LOW',
  UNAPPROVED_ABSENCE: 'MEDIUM',
  QA_BREACH: 'MEDIUM',
  CONDUCT: 'HIGH',
  SAFETY: 'HIGH',
};

function serialize(i) {
  return {
    id: i.id,
    employeeId: i.employeeId,
    name: i.employee.name,
    branch: i.employee.branch,
    type: i.type,
    severity: i.severity,
    detail: i.detail,
    action: i.action,
    status: i.status,
    ownerName: i.owner ? (i.owner.employee ? i.owner.employee.name : i.owner.email) : null,
    closedByName: i.closedBy ? (i.closedBy.employee ? i.closedBy.employee.name : i.closedBy.email) : null,
    closedAt: i.closedAt,
    createdAt: i.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, INCIDENTS_VIEW);
  if (errorResponse) return errorResponse;

  const incidents = await prisma.incident.findMany({
    include: { employee: true, owner: { include: { employee: true } }, closedBy: { include: { employee: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return json({ incidents: incidents.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, INCIDENTS_LOG);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { employeeId, type, detail } = body;
  if (!employeeId || !type || !detail) {
    return json({ error: 'employeeId, type and detail are required' }, { status: 400 });
  }
  if (!TYPE_SEVERITY[type]) {
    return json({ error: `type must be one of: ${Object.keys(TYPE_SEVERITY).join(', ')}` }, { status: 400 });
  }
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) return json({ error: 'Employee not found' }, { status: 400 });

  const incident = await prisma.incident.create({
    data: {
      employeeId,
      type,
      severity: TYPE_SEVERITY[type],
      detail,
      action: body.action || null,
      ownerUserId: session.uid,
    },
    include: { employee: true, owner: { include: { employee: true } }, closedBy: { include: { employee: true } } },
  });

  await logAudit({ session, action: 'INCIDENT_LOGGED', targetType: 'Incident', targetId: incident.id, detail: { employee: employee.name, type } });

  return json({ incident: serialize(incident) }, { status: 201 });
}

module.exports = { GET, POST };
