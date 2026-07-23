const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { PAYROLL_VIEW, PAYROLL_PREPARE } = require('../../../../lib/roles');
const { computePayslip } = require('../../../../lib/payroll');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serializeRun(run) {
  const totalNet = run.payslips.reduce((sum, p) => sum + Number(p.netPay), 0);
  return {
    id: run.id,
    period: run.period,
    status: run.status,
    createdAt: run.createdAt,
    approvedAt: run.approvedAt,
    staffPaid: run.payslips.length,
    totalNet: Math.round(totalNet * 100) / 100,
    payslips: run.payslips.map((p) => ({
      id: p.id,
      employeeId: p.employeeId,
      name: p.employee.name,
      jobTitle: p.employee.jobTitle,
      grossPay: Number(p.grossPay),
      overtimePay: Number(p.overtimePay),
      otherDeductions: Number(p.otherDeductions),
      deductionNote: p.deductionNote,
      ssnitEmployee: Number(p.ssnitEmployee),
      ssnitEmployer: Number(p.ssnitEmployer),
      payeTax: Number(p.payeTax),
      netPay: Number(p.netPay),
    })),
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, PAYROLL_VIEW);
  if (errorResponse) return errorResponse;

  const runs = await prisma.payrollRun.findMany({
    include: { payslips: { include: { employee: true } } },
    orderBy: { period: 'desc' },
  });
  return json({ runs: runs.map(serializeRun) });
}

// Creates a new DRAFT payroll run and computes a payslip for every active
// employee, using whatever PayrollSettings row is currently effective (rates
// are never hard-coded here).
async function POST(request) {
  const { session, errorResponse } = requireRole(request, PAYROLL_PREPARE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const period = body.period || new Date().toISOString().slice(0, 7); // "YYYY-MM"

  const existing = await prisma.payrollRun.findUnique({ where: { period } });
  if (existing) return json({ error: `A payroll run for ${period} already exists` }, { status: 409 });

  const settings = await prisma.payrollSettings.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  if (!settings) return json({ error: 'No PayrollSettings configured — run the seed script' }, { status: 500 });

  const employees = await prisma.employee.findMany({ where: { active: true } });

  const run = await prisma.payrollRun.create({
    data: { period, createdByUserId: session.uid },
  });

  const payslips = [];
  for (const emp of employees) {
    const figures = computePayslip({ grossPay: emp.salaryGross, overtimePay: 0, otherDeductions: 0 }, settings);
    const payslip = await prisma.payslip.create({
      data: {
        payrollRunId: run.id,
        employeeId: emp.id,
        grossPay: figures.grossPay,
        overtimePay: figures.overtimePay,
        otherDeductions: figures.otherDeductions,
        ssnitEmployee: figures.ssnitEmployee,
        ssnitEmployer: figures.ssnitEmployer,
        payeTax: figures.payeTax,
        netPay: figures.netPay,
      },
      include: { employee: true },
    });
    payslips.push(payslip);
  }

  await logAudit({ session, action: 'PAYROLL_RUN_CREATED', targetType: 'PayrollRun', targetId: run.id, detail: { period, staffCount: payslips.length } });

  return json({ run: serializeRun({ ...run, payslips }) }, { status: 201 });
}

module.exports = { GET, POST };
