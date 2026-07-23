// "Send reminder" for a renewal-due contract — now a real email (via
// lib/email) to whoever the recipient genuinely is for this contract's type,
// in addition to the reminderSentAt/audit trail this route always wrote:
//   - CLIENT contract  -> every CLIENT-role portal login on that Client
//   - STAFF contract   -> that Employee's own User login, if they have one
//   - VENDOR contract  -> no email address exists anywhere in this data
//     model for a vendor (Contract.vendorName is a bare string, not a
//     contact), so there is genuinely no honest recipient to send to; this
//     still marks the reminder as sent/audited (a human still needs to
//     follow up with the vendor directly), it just can't email anyone.
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { sendEmail } = require('../../../../../lib/email');
const { renderEmailTemplate } = require('../../../../../lib/email-templates');
const { CONTRACTS_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

async function resolveRecipients(contract) {
  if (contract.type === 'CLIENT' && contract.clientId) {
    const portalUsers = await prisma.user.findMany({ where: { clientId: contract.clientId, role: 'CLIENT' } });
    return portalUsers.map((u) => u.email);
  }
  if (contract.type === 'STAFF' && contract.employeeId) {
    const user = await prisma.user.findUnique({ where: { employeeId: contract.employeeId } });
    return user ? [user.email] : [];
  }
  return []; // VENDOR — no contact email exists in this data model
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, CONTRACTS_MANAGE);
  if (errorResponse) return errorResponse;

  const contract = await prisma.contract.findUnique({ where: { id: params.id } });
  if (!contract) return json({ error: 'Not found' }, { status: 404 });

  const recipients = await resolveRecipients(contract);
  let emailSent = null;
  if (recipients.length) {
    const results = await Promise.all(
      recipients.map((to) =>
        sendEmail({
          to,
          subject: `Contract renewal due: ${contract.title}`,
          html: renderEmailTemplate('contract-reminder', {
            CONTRACT_TITLE: contract.title,
            RENEWAL_DATE: fmtDate(contract.renewalDueDate),
            CONTRACT_VALUE: contract.value != null ? `${contract.currency} ${Number(contract.value).toLocaleString('en-US')}` : '—',
          }),
          text: `Contract renewal reminder: ${contract.title}, renewal due ${fmtDate(contract.renewalDueDate)}.`,
        })
      )
    );
    emailSent = results.every((r) => r.ok);
    if (!emailSent) console.error(`[contracts/remind] one or more reminder emails failed for contract ${contract.id}`);
  }

  const updated = await prisma.contract.update({
    where: { id: contract.id },
    data: { reminderSentAt: new Date(), reminderSentByUserId: session.uid },
  });

  await logAudit({
    session,
    action: 'CONTRACT_REMINDER_SENT',
    targetType: 'Contract',
    targetId: updated.id,
    detail: { title: updated.title, recipientCount: recipients.length, emailSent },
  });

  return json({
    contract: { id: updated.id, reminderSentAt: updated.reminderSentAt },
    emailSent,
    recipientCount: recipients.length,
  });
}

module.exports = { POST };
