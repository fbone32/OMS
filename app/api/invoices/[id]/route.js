// Single invoice — used by the Invoices screen's "View invoice" branded
// viewer modal.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { INVOICES_VIEW } = require('../../../../lib/roles');
const { serializeInvoice } = require('../../../../lib/invoices');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  const { errorResponse } = requireRole(request, INVOICES_VIEW);
  if (errorResponse) return errorResponse;

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { client: true, lineItems: true },
  });
  if (!invoice) return json({ error: 'Not found' }, { status: 404 });
  return json({ invoice: serializeInvoice(invoice) });
}

module.exports = { GET };
