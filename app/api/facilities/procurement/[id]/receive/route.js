// Phase 4 extension of Phase 3's Procurement approval workflow: marking an
// APPROVED purchase order "received" posts its cost to the Finance expense
// ledger automatically, in one transaction (never a manually re-entered,
// separately-mocked expense).
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { PROCUREMENT_RECEIVE } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// costLabel is free text like "GH₵ 4,000" (see ProcurementRequest.costLabel
// comment) — pull the numeric amount out of it rather than inventing a
// second structured amount field that could drift from the label shown
// throughout the existing Procurement UI.
function parseAmount(costLabel) {
  const match = String(costLabel).replace(/,/g, '').match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, PROCUREMENT_RECEIVE);
  if (errorResponse) return errorResponse;

  const existing = await prisma.procurementRequest.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'APPROVED') {
    return json({ error: 'Only an approved request can be marked received' }, { status: 400 });
  }

  const amount = parseAmount(existing.costLabel);

  const [request_, expense] = await prisma.$transaction(async (tx) => {
    const expense = await tx.expense.create({
      data: {
        category: 'Procurement',
        description: `${existing.item} (${existing.reason})`,
        amount,
        currency: 'GH₵',
        source: 'PROCUREMENT',
        sourceRef: existing.id,
        createdByUserId: session.uid,
      },
    });
    const updated = await tx.procurementRequest.update({
      where: { id: existing.id },
      data: { status: 'RECEIVED', receivedByUserId: session.uid, receivedAt: new Date(), postedExpenseId: expense.id },
    });
    return [updated, expense];
  });

  await logAudit({
    session,
    action: 'PROCUREMENT_RECEIVED',
    targetType: 'ProcurementRequest',
    targetId: request_.id,
    detail: { item: request_.item, expenseId: expense.id, amountPosted: Number(expense.amount) },
  });

  return json({
    request: { id: request_.id, status: request_.status, receivedAt: request_.receivedAt },
    expense: { id: expense.id, amount: Number(expense.amount), description: expense.description },
  });
}

module.exports = { POST };
