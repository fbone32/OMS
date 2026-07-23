// Bank reconciliation — bank statement lines to match against ledger
// (Expense) entries. GET lists lines (+ candidate expense matches by nearest
// amount, unreconciled only); POST imports new lines (a real "import
// statement" action — no live bank feed integration exists, so this is the
// honest manual-import stand-in, same category as other "no external infra
// yet" stopgaps in this app).
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { FINANCE_VIEW, FINANCE_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(l) {
  return {
    id: l.id,
    date: l.date,
    description: l.description,
    amount: Number(l.amount),
    reconciled: !!l.matchedExpenseId,
    matchedExpenseId: l.matchedExpenseId,
    matchedExpenseDescription: l.matchedExpense ? l.matchedExpense.description : null,
    matchedAt: l.matchedAt,
    createdAt: l.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, FINANCE_VIEW);
  if (errorResponse) return errorResponse;

  const [lines, unmatchedExpenses] = await Promise.all([
    prisma.bankStatementLine.findMany({
      include: { matchedExpense: true },
      orderBy: [{ date: 'desc' }],
    }),
    prisma.expense.findMany({ where: { bankMatch: null }, orderBy: [{ date: 'desc' }] }),
  ]);

  return json({
    lines: lines.map(serialize),
    unmatchedExpenses: unmatchedExpenses.map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      date: e.date,
      category: e.category,
    })),
  });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, FINANCE_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const description = (body.description || '').trim();
  const amount = Number(body.amount);
  if (!description || !amount || Number.isNaN(amount) || amount === 0) {
    return json({ error: 'description and a non-zero amount are required' }, { status: 400 });
  }

  const line = await prisma.bankStatementLine.create({
    data: {
      date: body.date ? new Date(body.date) : new Date(),
      description,
      amount,
      importedByUserId: session.uid,
    },
  });

  await logAudit({ session, action: 'BANK_LINE_IMPORTED', targetType: 'BankStatementLine', targetId: line.id, detail: { description, amount } });

  return json({ line: serialize({ ...line, matchedExpense: null }) }, { status: 201 });
}

module.exports = { GET, POST };
