// Match (or unmatch) a bank statement line against a ledger Expense entry —
// the actual "reconciliation" action.
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { FINANCE_MANAGE } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, FINANCE_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const line = await prisma.bankStatementLine.findUnique({ where: { id: params.id } });
  if (!line) return json({ error: 'Not found' }, { status: 404 });

  if (body.expenseId === null || body.expenseId === undefined) {
    // Unmatch.
    const updated = await prisma.bankStatementLine.update({
      where: { id: line.id },
      data: { matchedExpenseId: null, matchedByUserId: null, matchedAt: null },
    });
    await logAudit({ session, action: 'BANK_LINE_UNMATCHED', targetType: 'BankStatementLine', targetId: updated.id });
    return json({ line: { id: updated.id, reconciled: false } });
  }

  const expense = await prisma.expense.findUnique({ where: { id: body.expenseId } });
  if (!expense) return json({ error: 'Expense not found' }, { status: 404 });

  const updated = await prisma.bankStatementLine
    .update({
      where: { id: line.id },
      data: { matchedExpenseId: expense.id, matchedByUserId: session.uid, matchedAt: new Date() },
    })
    .catch((err) => {
      if (err && err.code === 'P2002') return null; // that expense is already matched to a different line
      throw err;
    });
  if (!updated) return json({ error: 'That expense is already matched to another statement line' }, { status: 409 });

  await logAudit({
    session,
    action: 'BANK_LINE_MATCHED',
    targetType: 'BankStatementLine',
    targetId: updated.id,
    detail: { expenseId: expense.id, description: expense.description },
  });

  return json({ line: { id: updated.id, reconciled: true, matchedExpenseId: expense.id } });
}

module.exports = { PATCH };
