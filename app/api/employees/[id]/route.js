const { prisma } = require('../../../../lib/db');
const { requireRole, getSession, unauthorized, forbidden } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { EMPLOYEES_READ, EMPLOYEES_WRITE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(e) {
  return {
    id: e.id,
    name: e.name,
    jobTitle: e.jobTitle,
    branch: e.branch,
    startDate: e.startDate,
    salaryGross: e.salaryGross != null ? Number(e.salaryGross) : null,
    nationalId: e.nationalId,
    bankName: e.bankName,
    bankAccountNumber: e.bankAccountNumber,
    mobileMoneyProvider: e.mobileMoneyProvider,
    mobileMoneyNumber: e.mobileMoneyNumber,
    emergencyContactName: e.emergencyContactName,
    emergencyContactPhone: e.emergencyContactPhone,
    emergencyContactRelation: e.emergencyContactRelation,
    active: e.active,
    // Phase 4 (Client Portal) — which client this person is staffed to, if
    // any. Drives the Client Portal's "your team roster".
    clientId: e.clientId || null,
  };
}

async function GET(request, { params }) {
  const session = getSession(request);
  if (!session) return unauthorized();
  const isSelf = session.employeeId === params.id;
  if (!isSelf && !EMPLOYEES_READ.includes(session.role)) return forbidden();

  const employee = await prisma.employee.findUnique({ where: { id: params.id } });
  if (!employee) return json({ error: 'Not found' }, { status: 404 });
  return json({ employee: serialize(employee) });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, EMPLOYEES_WRITE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = {};
  const editable = [
    'name', 'jobTitle', 'branch', 'nationalId', 'bankName', 'bankAccountNumber',
    'mobileMoneyProvider', 'mobileMoneyNumber', 'emergencyContactName',
    'emergencyContactPhone', 'emergencyContactRelation', 'active',
  ];
  for (const f of editable) if (f in body) data[f] = body[f];
  if ('salaryGross' in body) data.salaryGross = body.salaryGross;
  if ('startDate' in body) data.startDate = new Date(body.startDate);
  // Phase 4 (Client Portal) — Director/HR can (un)assign this person to a
  // client's roster. `null`/'' clears the assignment.
  if ('clientId' in body) data.clientId = body.clientId || null;

  const employee = await prisma.employee.update({ where: { id: params.id }, data }).catch(() => null);
  if (!employee) return json({ error: 'Not found' }, { status: 404 });

  await logAudit({ session, action: 'EMPLOYEE_UPDATED', targetType: 'Employee', targetId: employee.id, detail: { fields: Object.keys(data) } });

  return json({ employee: serialize(employee) });
}

module.exports = { GET, PATCH };
