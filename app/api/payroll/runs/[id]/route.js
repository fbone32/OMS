const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { PAYROLL_VIEW } = require('../../../../../lib/roles');

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

async function GET(request, { params }) {
  const { errorResponse } = requireRole(request, PAYROLL_VIEW);
  if (errorResponse) return errorResponse;

  const run = await prisma.payrollRun.findUnique({
    where: { id: params.id },
    include: { payslips: { include: { employee: true } } },
  });
  if (!run) return json({ error: 'Not found' }, { status: 404 });
  return json({ run: serializeRun(run) });
}

module.exports = { GET };
