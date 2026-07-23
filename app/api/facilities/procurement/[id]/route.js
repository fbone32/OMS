const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { sendEmail } = require('../../../../../lib/email');
const { renderEmailTemplate } = require('../../../../../lib/email-templates');
const { PROCUREMENT_DECIDE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, PROCUREMENT_DECIDE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!['APPROVED', 'DENIED'].includes(body.status)) {
    return json({ error: "status must be 'APPROVED' or 'DENIED'" }, { status: 400 });
  }

  const existing = await prisma.procurementRequest.findUnique({ where: { id: params.id }, include: { requestedBy: true } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.status !== 'PENDING') return json({ error: 'This request has already been decided' }, { status: 400 });

  const request_ = await prisma.procurementRequest.update({
    where: { id: params.id },
    data: { status: body.status, decidedByUserId: session.uid, decidedAt: new Date() },
  });

  // Real "PO/procurement-decision notification" per the brief's integration
  // requirements — email the requester (via lib/email), never crashing this
  // request if RESEND_API_KEY isn't configured.
  let emailSent = null;
  if (existing.requestedBy) {
    const approved = body.status === 'APPROVED';
    const result = await sendEmail({
      to: existing.requestedBy.email,
      subject: `Procurement request ${approved ? 'approved' : 'denied'}: ${existing.item}`,
      html: renderEmailTemplate('procurement-decision', {
        REQUESTER_FIRST_NAME: (existing.requestedBy.email.split('@')[0] || 'there'),
        DECISION_WORD: approved ? 'approved' : 'denied',
        BANNER_BG: approved ? '#E7F1EC' : '#FBECEC',
        BANNER_FG: approved ? '#2E6B4F' : '#9B2C2C',
        BANNER_LABEL: approved ? 'Approved' : 'Denied',
        ITEM_NAME: existing.item,
        ITEM_COST: existing.costLabel,
        ITEM_REASON: existing.reason,
        CLOSING_NOTE: approved
          ? 'Please proceed with ordering — remember to mark it received once it arrives so it posts to the expense ledger.'
          : 'If you have questions about this decision, reach out to your Director.',
      }),
      text: `Your procurement request for "${existing.item}" (${existing.costLabel}) was ${approved ? 'approved' : 'denied'}.`,
    });
    emailSent = result.ok;
  }

  await logAudit({
    session,
    action: body.status === 'APPROVED' ? 'PROCUREMENT_APPROVED' : 'PROCUREMENT_DENIED',
    targetType: 'ProcurementRequest',
    targetId: request_.id,
    detail: { item: request_.item, emailSent },
  });

  return json({ request: { id: request_.id, status: request_.status, decidedAt: request_.decidedAt }, emailSent });
}

module.exports = { PATCH };
