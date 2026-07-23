const { prisma } = require('../../../lib/db');
const { requireRole, getSession, unauthorized } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { EMPLOYEES_READ, EMPLOYEES_WRITE, INCIDENTS_LOG, QA_ENTRY, TRAINING_RECORD, ASSETS_MANAGE, CONTRACTS_MANAGE } = require('../../../lib/roles');

// Roles allowed to see the minimal "picker" shape (?basic=1) — anyone who
// needs to attribute a Phase 2/3/4 record (incident/QA audit/training
// completion/asset assignment/STAFF contract) to an employee, without
// granting them the full directory (salary/banking/national ID) that
// EMPLOYEES_READ implies.
const BASIC_PICKER_ROLES = Array.from(new Set([...EMPLOYEES_READ, ...INCIDENTS_LOG, ...QA_ENTRY, ...TRAINING_RECORD, ...ASSETS_MANAGE, ...CONTRACTS_MANAGE]));

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
  };
}

async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();
  // Self-service: an employee may fetch just their own record via ?self=1,
  // even though they aren't in EMPLOYEES_READ (full directory).
  const url = new URL(request.url);
  if (url.searchParams.get('self') === '1') {
    if (!session.employeeId) return json({ employees: [] });
    const e = await prisma.employee.findUnique({ where: { id: session.employeeId } });
    return json({ employees: e ? [serialize(e)] : [] });
  }

  // Minimal picker shape for Phase 2 forms (log an incident / QA audit /
  // training completion) — real names+ids, deliberately no salary/banking/
  // national ID fields, and open to a wider role set than the full
  // directory below.
  if (url.searchParams.get('basic') === '1') {
    const { errorResponse: basicError } = requireRole(request, BASIC_PICKER_ROLES);
    if (basicError) return basicError;
    const employees = await prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, jobTitle: true, branch: true },
      orderBy: { name: 'asc' },
    });
    return json({ employees });
  }

  const { errorResponse } = requireRole(request, EMPLOYEES_READ);
  if (errorResponse) return errorResponse;

  const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
  return json({ employees: employees.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, EMPLOYEES_WRITE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  // Only name/jobTitle/branch are required for the Employee record itself —
  // salary/banking/national ID/emergency contact are all fillable later by
  // HR (e.g. via the onboarding flow at POST /api/employees/onboard, which
  // also creates the linked login). startDate defaults to today if omitted.
  const required = ['name', 'jobTitle', 'branch'];
  for (const f of required) {
    if (!body[f] && body[f] !== 0) return json({ error: `Missing field: ${f}` }, { status: 400 });
  }

  const employee = await prisma.employee.create({
    data: {
      name: body.name,
      jobTitle: body.jobTitle,
      branch: body.branch,
      startDate: body.startDate ? new Date(body.startDate) : new Date(),
      salaryGross: body.salaryGross != null && body.salaryGross !== '' ? body.salaryGross : null,
      nationalId: body.nationalId || null,
      bankName: body.bankName || null,
      bankAccountNumber: body.bankAccountNumber || null,
      mobileMoneyProvider: body.mobileMoneyProvider || null,
      mobileMoneyNumber: body.mobileMoneyNumber || null,
      emergencyContactName: body.emergencyContactName || null,
      emergencyContactPhone: body.emergencyContactPhone || null,
      emergencyContactRelation: body.emergencyContactRelation || null,
    },
  });

  await logAudit({ session, action: 'EMPLOYEE_CREATED', targetType: 'Employee', targetId: employee.id, detail: { name: employee.name } });

  return json({ employee: serialize(employee) }, { status: 201 });
}

module.exports = { GET, POST };
