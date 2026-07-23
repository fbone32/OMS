// Real, editable invoice VAT/levy-rate table — never hard-coded in
// application logic, same pattern as app/api/payroll/settings. See
// lib/invoice-tax.js and schema.prisma's InvoiceTaxSettings comment for the
// full "placeholder rates, unverified compounding order" disclaimer.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { FINANCE_VIEW, FINANCE_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(s) {
  return {
    id: s.id,
    vatRatePct: Number(s.vatRatePct),
    nhilRatePct: Number(s.nhilRatePct),
    getfundRatePct: Number(s.getfundRatePct),
    covidLevyRatePct: Number(s.covidLevyRatePct),
    effectiveFrom: s.effectiveFrom,
    notes: s.notes,
    updatedAt: s.updatedAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, FINANCE_VIEW);
  if (errorResponse) return errorResponse;

  const settings = await prisma.invoiceTaxSettings.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  if (!settings) return json({ error: 'No InvoiceTaxSettings configured — run the seed script' }, { status: 500 });
  return json({ settings: serialize(settings) });
}

// Editable at runtime by an authorized role — never hard-coded in
// application logic, per the same compliance principle as payroll settings.
async function PATCH(request) {
  const { session, errorResponse } = requireRole(request, FINANCE_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const current = await prisma.invoiceTaxSettings.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  const data = {
    vatRatePct: body.vatRatePct ?? current?.vatRatePct,
    nhilRatePct: body.nhilRatePct ?? current?.nhilRatePct,
    getfundRatePct: body.getfundRatePct ?? current?.getfundRatePct,
    covidLevyRatePct: body.covidLevyRatePct ?? current?.covidLevyRatePct,
    notes: body.notes ?? current?.notes,
    updatedByUserId: session.uid,
  };

  // Insert a new row (rather than mutating in place) so the change is
  // itself auditable and invoices already generated stay reproducible
  // against the rates that were effective when they were created (see
  // Invoice's own snapshotted vatAmount/nhilAmount/etc. fields).
  const created = await prisma.invoiceTaxSettings.create({ data });

  await logAudit({ session, action: 'INVOICE_TAX_SETTINGS_UPDATED', targetType: 'InvoiceTaxSettings', targetId: created.id, detail: body });

  return json({ settings: serialize(created) });
}

module.exports = { GET, PATCH };
