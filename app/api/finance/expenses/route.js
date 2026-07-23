// Company expense ledger (Phase 4). Manual entries are added here by the
// Accountant/Director; PAYROLL and PROCUREMENT rows are posted automatically
// (see app/api/payroll/runs/[id]/approve and
// app/api/facilities/procurement/[id]/receive) — never hand-duplicated.
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

function serialize(e) {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amount: Number(e.amount),
    currency: e.currency,
    date: e.date,
    source: e.source,
    sourceRef: e.sourceRef,
    createdByEmail: e.createdBy ? e.createdBy.email : null,
    createdAt: e.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, FINANCE_VIEW);
  if (errorResponse) return errorResponse;

  const expenses = await prisma.expense.findMany({
    include: { createdBy: true },
    orderBy: [{ date: 'desc' }],
  });
  return json({ expenses: expenses.map(serialize) });
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
  const category = (body.category || '').trim();
  const description = (body.description || '').trim();
  const amount = Number(body.amount);
  if (!category || !description || !amount || Number.isNaN(amount) || amount <= 0) {
    return json({ error: 'category, description and a positive amount are required' }, { status: 400 });
  }

  const expense = await prisma.expense.create({
    data: {
      category,
      description,
      amount,
      currency: body.currency || 'GH₵',
      date: body.date ? new Date(body.date) : new Date(),
      source: 'MANUAL',
      createdByUserId: session.uid,
    },
    include: { createdBy: true },
  });

  await logAudit({ session, action: 'EXPENSE_ADDED', targetType: 'Expense', targetId: expense.id, detail: { category, amount } });

  return json({ expense: serialize(expense) }, { status: 201 });
}

module.exports = { GET, POST };
