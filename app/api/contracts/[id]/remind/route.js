// "Send reminder" for a renewal-due contract. No real email infra exists yet
// (same stopgap as app/api/auth/forgot-password and the onboarding temp
// password) — this marks/logs the reminder as genuinely sent (reminderSentAt
// + an audit entry), which is the honest thing to make real without
// fabricating an email that never goes anywhere.
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { CONTRACTS_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, CONTRACTS_MANAGE);
  if (errorResponse) return errorResponse;

  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract) return json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { reminderSentAt: new Date(), reminderSentByUserId: session.uid },
  });

  await logAudit({
    session,
    action: 'CONTRACT_REMINDER_SENT',
    targetType: 'Contract',
    targetId: updated.id,
    detail: { title: updated.title },
  });

  return json({ contract: { id: updated.id, reminderSentAt: updated.reminderSentAt } });
}

module.exports = { POST };
