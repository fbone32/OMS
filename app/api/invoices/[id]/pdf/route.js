// Real, branded invoice PDF download (brief: invoices "must be downloadable
// and match company branding") — see lib/invoice-pdf.js for the layout.
// Same INVOICES_VIEW role gate as the rest of the internal Invoices screen
// (Director/Accountant/HR Officer).
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { INVOICES_VIEW } = require('../../../../../lib/roles');
const { serializeInvoice } = require('../../../../../lib/invoices');
const { generateInvoicePdf } = require('../../../../../lib/invoice-pdf');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  const { session, errorResponse } = requireRole(request, INVOICES_VIEW);
  if (errorResponse) return errorResponse;

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { client: true, lineItems: true },
  });
  if (!invoice) return json({ error: 'Not found' }, { status: 404 });

  const data = serializeInvoice(invoice);
  data.clientAddress = invoice.client ? `${invoice.client.region}, Ghana` : '';
  data.bank = 'Ecobank Ghana';
  data.account = '1441 2200 8890';
  data.swift = 'ECOCGHAC';

  let pdfBuffer;
  try {
    pdfBuffer = await generateInvoicePdf(data);
  } catch (err) {
    console.error('[invoices/pdf] PDF generation failed:', err);
    return json({ error: 'Could not generate PDF' }, { status: 500 });
  }

  await logAudit({ session, action: 'INVOICE_PDF_DOWNLOADED', targetType: 'Invoice', targetId: invoice.id });

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
