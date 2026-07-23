// Company-level P&L (Phase 4) — computed live from real data, never a
// separately-mocked number: revenue is the sum of ACTIVE client Contract
// values (recurring service agreements from Sales conversions), expenses are
// the real Expense ledger (which itself includes the real PayrollRun cost
// and received ProcurementRequest costs — see those routes).
//
// ASSUMPTION (flag for sign-off): this company deals in a mix of GH₵ and $
// contract currencies with no FX-rate model in this app, so revenue/expense
// totals are a simple sum across currencies labelled by whichever currency
// is most common in the underlying rows, NOT a real currency-converted
// figure. Good enough to prove the pipeline (real contracts -> real
// revenue, real payroll/procurement -> real expenses) without fabricating
// an FX rate; a real deployment would need a proper multi-currency ledger.
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

  const url = new URL(request.url);
  const period = url.searchParams.get('period'); // e.g. "2026-07" — filters expenses/PAYE-period; revenue (contracts) is always "as of now"

  const [activeContracts, expenses] = await Promise.all([
    prisma.contract.findMany({ where: { type: 'CLIENT', status: { in: ['ACTIVE', 'RENEWAL_DUE'] } } }),
    prisma.expense.findMany({
      where: period ? { date: { gte: new Date(period + '-01'), lt: new Date(addMonth(period)) } } : undefined,
    }),
  ]);

  const revenue = activeContracts.reduce((sum, c) => sum + (c.value != null ? Number(c.value) : 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const byCategory = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
  }
  const bySource = { MANUAL: 0, PAYROLL: 0, PROCUREMENT: 0 };
  for (const e of expenses) bySource[e.source] = (bySource[e.source] || 0) + Number(e.amount);

  return json({
    revenue: Math.round(revenue * 100) / 100,
    revenueContractCount: activeContracts.length,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netIncome: Math.round((revenue - totalExpenses) * 100) / 100,
    expensesByCategory: Object.entries(byCategory)
      .map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount),
    expensesBySource: bySource,
    expenseCount: expenses.length,
  });
}

function addMonth(period) {
  const [y, m] = period.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return next + '-01';
}

module.exports = { GET };
