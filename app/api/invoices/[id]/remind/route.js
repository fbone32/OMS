// "Remind" for an outstanding (sent, unpaid) invoice — a real reminder email
// to the client's portal contact(s), same recipient rule as the initial
// send, without changing the invoice's status.
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { INVOICES_MANAGE } = require('../../../../../lib/roles');
const { notifyInvoiceSent } = require('../../../../../lib/invoices');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, INVOICES_MANAGE);
  if (errorResponse) return errorResponse;

  const invoice = await prisma.invoice.findUnique({ where: { id: params.id }, include: { client: true, lineItems: true } });
  if (!invoice) return json({ error: 'Not found' }, { status: 404 });
  if (invoice.status !== 'SENT') {
    return json({ error: 'Only an outstanding (sent) invoice can be reminded' }, { status: 400 });
  }

  const emailResult = await notifyInvoiceSent(invoice, { reminder: true });

  await logAudit({
    session,
    action: 'INVOICE_REMINDER_SENT',
    targetType: 'Invoice',
    targetId: invoice.id,
    detail: { clientId: invoice.clientId, ...emailResult },
  });

  return json({ emailSent: emailResult });
}

module.exports = { POST };
