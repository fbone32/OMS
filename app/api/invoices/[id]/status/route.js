// Real, role-gated, audited invoice status transitions (brief: "draft/sent/
// paid/overdue"). Only two actor-driven transitions ever actually happen —
// DRAFT -> SENT and SENT -> PAID — see lib/invoices.js's header comment for
// why OVERDUE is derived at read time instead of a third manual click.
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { INVOICES_MANAGE } = require('../../../../../lib/roles');
const { serializeInvoice, notifyInvoiceSent } = require('../../../../../lib/invoices');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Which raw statuses a given target status may be reached from.
const ALLOWED_FROM = {
  SENT: ['DRAFT'],
  PAID: ['SENT'],
};

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, INVOICES_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const target = (body.status || '').toUpperCase();
  if (!ALLOWED_FROM[target]) {
    return json({ error: "status must be 'SENT' or 'PAID'" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: params.id }, include: { client: true, lineItems: true } });
  if (!invoice) return json({ error: 'Not found' }, { status: 404 });
  if (!ALLOWED_FROM[target].includes(invoice.status)) {
    return json({ error: `Cannot move an invoice from ${invoice.status} to ${target}` }, { status: 400 });
  }

  const now = new Date();
  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data:
      target === 'SENT'
        ? { status: 'SENT', sentAt: now }
        : { status: 'PAID', paidAt: now },
    include: { client: true, lineItems: true },
  });

  let emailResult = null;
  if (target === 'SENT') {
    emailResult = await notifyInvoiceSent(updated);
  }

  await logAudit({
    session,
    action: target === 'SENT' ? 'INVOICE_SENT' : 'INVOICE_MARKED_PAID',
    targetType: 'Invoice',
    targetId: updated.id,
    detail: { clientId: updated.clientId, amount: Number(updated.amount), ...(emailResult ? { emailResult } : {}) },
  });

  return json({ invoice: serializeInvoice(updated), emailSent: emailResult });
}

module.exports = { PATCH };
