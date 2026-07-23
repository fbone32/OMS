// Client Portal's own branded invoice PDF download — same clientId
// isolation rule as every other portal route: a CLIENT session can only
// ever download its own invoice, verified server-side against the real
// Invoice.clientId, never trusted from a query param.
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { PORTAL_VIEW } = require('../../../../../../lib/roles');
const { serializeInvoice } = require('../../../../../../lib/invoices');
const { generateInvoicePdf } = require('../../../../../../lib/invoice-pdf');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  const { session, errorResponse } = requireRole(request, PORTAL_VIEW);
  if (errorResponse) return errorResponse;

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { client: true, lineItems: true },
  });
  if (!invoice || invoice.status === 'DRAFT') return json({ error: 'Not found' }, { status: 404 });

  if (session.role === 'CLIENT' && invoice.clientId !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }
  if (session.role !== 'CLIENT') {
    const url = new URL(request.url);
    const requestedClientId = url.searchParams.get('clientId');
    if (requestedClientId && invoice.clientId !== requestedClientId) {
      return json({ error: 'Not found' }, { status: 404 });
    }
  }

  const data = serializeInvoice(invoice);
  data.clientAddress = invoice.client ? `${invoice.client.region}, Ghana` : '';
  data.bank = 'Ecobank Ghana';
  data.account = '1441 2200 8890';
  data.swift = 'ECOCGHAC';

  let pdfBuffer;
  try {
    pdfBuffer = await generateInvoicePdf(data);
  } catch (err) {
    console.error('[portal/invoices/pdf] PDF generation failed:', err);
    return json({ error: 'Could not generate PDF' }, { status: 500 });
  }

  await logAudit({ session, action: 'PORTAL_INVOICE_PDF_DOWNLOADED', targetType: 'Invoice', targetId: invoice.id });

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.id}.pdf"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}

module.exports = { GET };
