const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { PAYROLL_APPROVE } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Director-only, per the brief ("Director: full access to everything,
// including approving payroll").
//
// Phase 4 (Finance): approving a run also posts its real total company cost
// (sum of gross pay + overtime + the EMPLOYER's own SSNIT contribution —
// not the employee-side deductions, which don't cost the company anything
// beyond gross) as one Expense row, so payroll feeds the P&L as a real
// expense line instead of a separately-mocked number (see
// app/api/finance/pnl). Idempotent: re-running this on an already-posted run
// never double-posts.
async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, PAYROLL_APPROVE);
  if (errorResponse) return errorResponse;

  const existing = await prisma.payrollRun.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'DRAFT') {
    return json({ error: `Run is already ${existing.status.toLowerCase()}` }, { status: 400 });
  }

  const payslips = await prisma.payslip.findMany({ where: { payrollRunId: existing.id } });
  const totalCost = payslips.reduce(
    (sum, p) => sum + Number(p.grossPay) + Number(p.overtimePay) + Number(p.ssnitEmployer),
    0
  );

  const [run] = await prisma.$transaction([
    prisma.payrollRun.update({
      where: { id: existing.id },
      data: { status: 'APPROVED', approvedByUserId: session.uid, approvedAt: new Date() },
    }),
    prisma.expense.create({
      data: {
        category: 'Payroll',
        description: `Payroll run · ${existing.period} (${payslips.length} employee${payslips.length === 1 ? '' : 's'})`,
        amount: Math.round(totalCost * 100) / 100,
        currency: 'GH₵',
        source: 'PAYROLL',
        sourceRef: existing.id,
        createdByUserId: session.uid,
      },
    }),
  ]);

  await logAudit({ session, action: 'PAYROLL_RUN_APPROVED', targetType: 'PayrollRun', targetId: run.id, detail: { period: run.period, expensePosted: Math.round(totalCost * 100) / 100 } });

  return json({ run });
}

module.exports = { POST };
