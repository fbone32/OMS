// Invoices (brief section 3A) — real billing register generated from real
// Client + Contract data, replacing the client-side-only mock the Invoices
// screen used to run on. Accountant/Director create; HR Officer can view
// (see lib/roles.js INVOICES_VIEW/INVOICES_MANAGE for the reasoning).
const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { INVOICES_VIEW, INVOICES_MANAGE } = require('../../../lib/roles');
const { periodFromDate, serializeInvoice, notifyInvoiceSent } = require('../../../lib/invoices');
const { computeInvoiceTax } = require('../../../lib/invoice-tax');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const { errorResponse } = requireRole(request, INVOICES_VIEW);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const clientId = url.searchParams.get('clientId');

  const invoices = await prisma.invoice.findMany({
    where: clientId ? { clientId } : undefined,
    include: { client: true, lineItems: true },
    orderBy: [{ createdAt: 'desc' }],
  });
  return json({ invoices: invoices.map(serializeInvoice) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, INVOICES_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clientId = (body.clientId || '').trim();
  if (!clientId) return json({ error: 'clientId is required' }, { status: 400 });
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return json({ error: 'Client not found' }, { status: 404 });

  let contractId = body.contractId ? String(body.contractId) : null;
  if (contractId) {
    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract || contract.clientId !== clientId) {
      return json({ error: 'contractId does not belong to this client' }, { status: 400 });
    }
  }

  // Accept either a real lineItems array, or the simple single
  // description+amount shape the Invoices screen's "New invoice" form
  // submits — both end up as real InvoiceLineItem rows either way.
  let lineItemsInput = Array.isArray(body.lineItems) ? body.lineItems : null;
  if (!lineItemsInput) {
    const description = (body.description || '').trim();
    const amount = Number(body.amount);
    if (!description || !amount || Number.isNaN(amount) || amount <= 0) {
      return json({ error: 'description and a positive amount are required (or supply lineItems)' }, { status: 400 });
    }
    lineItemsInput = [{ description, quantity: 1, unitPrice: amount }];
  }
  if (!lineItemsInput.length) return json({ error: 'At least one line item is required' }, { status: 400 });

  const lineItems = lineItemsInput.map((li) => {
    const quantity = li.quantity != null && li.quantity !== '' ? Number(li.quantity) : 1;
    const unitPrice = Number(li.unitPrice);
    const amount = Math.round(quantity * unitPrice * 100) / 100;
    return { description: String(li.description || '').trim(), quantity, unitPrice, amount };
  });
  const invalidLine = lineItems.find(
    (li) => !li.description || !li.unitPrice || Number.isNaN(li.unitPrice) || Number.isNaN(li.quantity) || li.unitPrice <= 0
  );
  if (invalidLine) return json({ error: 'Every line item needs a description and a positive unit price' }, { status: 400 });

  const subtotal = Math.round(lineItems.reduce((sum, li) => sum + li.amount, 0) * 100) / 100;
  const currency = body.currency || client.currency || '$';
  const dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.dueDate && Number.isNaN(dueDate.getTime())) return json({ error: 'dueDate is not a valid date' }, { status: 400 });
  const period = body.period || periodFromDate(dueDate);
  const wantsSend = !!body.send;

  // Export-of-services (VAT/levy exempt) vs. standard-rated is an explicit,
  // overridable decision (see schema.prisma's Invoice.taxExempt comment) —
  // `body.taxExempt` wins when the caller supplies it; otherwise this
  // defaults from Client.currency === '$' as a starting-point signal only
  // (a USD-billed client is presumptively an international/export
  // engagement), never asserted as verified fact.
  const taxExempt = body.taxExempt != null ? !!body.taxExempt : client.currency === '$';
  const taxSettings = await prisma.invoiceTaxSettings.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  const tax = computeInvoiceTax(subtotal, taxExempt, taxSettings);

  const created = await prisma.invoice.create({
    data: {
      clientId,
      contractId,
      period,
      currency,
      amount: subtotal,
      taxExempt,
      vatAmount: tax.vatAmount,
      nhilAmount: tax.nhilAmount,
      getfundAmount: tax.getfundAmount,
      covidLevyAmount: tax.covidLevyAmount,
      totalAmount: tax.totalAmount,
      dueDate,
      createdByUserId: session.uid,
      status: wantsSend ? 'SENT' : 'DRAFT',
      sentAt: wantsSend ? new Date() : null,
      lineItems: { create: lineItems },
    },
    include: { client: true, lineItems: true },
  });

  await logAudit({
    session,
    action: 'INVOICE_CREATED',
    targetType: 'Invoice',
    targetId: created.id,
    detail: { clientId, subtotal, totalAmount: tax.totalAmount, taxExempt, currency, period, sentImmediately: wantsSend },
  });

  let emailResult = null;
  if (wantsSend) {
    emailResult = await notifyInvoiceSent(created);
    await logAudit({
      session,
      action: 'INVOICE_SENT',
      targetType: 'Invoice',
      targetId: created.id,
      detail: emailResult,
    });
  }

  return json({ invoice: serializeInvoice(created), emailSent: emailResult }, { status: 201 });
}

module.exports = { GET, POST };
