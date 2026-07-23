const { prisma } = require('../../../../lib/db');
const { getSession, unauthorized } = require('../../../../lib/auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Employee self-service: "own payslips" (brief). Any authenticated,
// employee-linked user can see their own payslip history — no role gate
// beyond being tied to that employee record.
async function GET(request) {
  const session = getSession(request);
  if (!session) return unauthorized();
  if (!session.employeeId) return json({ payslips: [] });

  const payslips = await prisma.payslip.findMany({
    where: { employeeId: session.employeeId },
    include: { payrollRun: true, employee: true },
    orderBy: { payrollRun: { period: 'desc' } },
  });

  return json({
    payslips: payslips.map((p) => ({
      id: p.id,
      period: p.payrollRun.period,
      status: p.payrollRun.status,
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
  });
}

module.exports = { GET };
