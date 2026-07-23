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
async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, PAYROLL_APPROVE);
  if (errorResponse) return errorResponse;

  const run = await prisma.payrollRun.update({
    where: { id: params.id },
    data: { status: 'APPROVED', approvedByUserId: session.uid, approvedAt: new Date() },
  }).catch(() => null);
  if (!run) return json({ error: 'Not found' }, { status: 404 });

  await logAudit({ session, action: 'PAYROLL_RUN_APPROVED', targetType: 'PayrollRun', targetId: run.id, detail: { period: run.period } });

  return json({ run });
}

module.exports = { POST };
