// Statutory tax/filing calendar (PAYE, SSNIT, VAT, corporate tax) — due
// dates and filed status. Rows are seeded ahead (see prisma/seed.mjs) so the
// calendar always shows the current + next period's due dates; marking one
// filed is a real, audited write (app/api/finance/tax-filings/[id]).
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { FINANCE_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const { errorResponse } = requireRole(request, FINANCE_VIEW);
  if (errorResponse) return errorResponse;

  const filings = await prisma.taxFiling.findMany({
    include: { filedBy: true },
    orderBy: [{ dueDate: 'asc' }],
  });

  return json({
    filings: filings.map((f) => ({
      id: f.id,
      type: f.type,
      period: f.period,
      dueDate: f.dueDate,
      amount: f.amount != null ? Number(f.amount) : null,
      filed: f.filed,
      filedAt: f.filedAt,
      filedByEmail: f.filedBy ? f.filedBy.email : null,
      notes: f.notes,
      overdue: !f.filed && new Date(f.dueDate) < new Date(),
    })),
  });
}

module.exports = { GET };
