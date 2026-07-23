// Shared helpers for the Invoice model (brief section 3A) — kept out of the
// route files so app/api/invoices (create, optionally send in the same
// request) and app/api/invoices/[id]/status (send an existing draft later)
// serialize and notify identically instead of drifting apart.
const { prisma } = require('./db');
const { sendEmail } = require('./email');
const { renderEmailTemplate } = require('./email-templates');

function periodFromDate(d) {
  const dt = d ? new Date(d) : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

// OVERDUE is deliberately never written to the DB by an actor — it's derived
// here at read time, the same pattern app/api/contracts already uses for
// Contract.status's RENEWAL_DUE/EXPIRED (see that route's renewalStatus()).
function effectiveStatus(inv) {
  if (inv.status === 'SENT' && inv.dueDate && new Date(inv.dueDate) < new Date()) return 'OVERDUE';
  return inv.status;
}

function serializeInvoice(inv) {
  return {
    id: inv.id,
    clientId: inv.clientId,
    clientName: inv.client ? inv.client.name : null,
    contractId: inv.contractId,
    period: inv.period,
    currency: inv.currency,
    // `amount` is the pre-tax SUBTOTAL (kept for backward compatibility with
    // callers that only care about the line-item total); `totalAmount` is
    // the real amount due including tax — use that for anything shown to a
    // client as "amount due".
    amount: Number(inv.amount),
    subtotal: Number(inv.amount),
    taxExempt: inv.taxExempt,
    vatAmount: Number(inv.vatAmount || 0),
    nhilAmount: Number(inv.nhilAmount || 0),
    getfundAmount: Number(inv.getfundAmount || 0),
    covidLevyAmount: Number(inv.covidLevyAmount || 0),
    totalAmount: Number(inv.totalAmount != null ? inv.totalAmount : inv.amount),
    status: inv.status,
    effectiveStatus: effectiveStatus(inv),
    dueDate: inv.dueDate,
    sentAt: inv.sentAt,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    lineItems: (inv.lineItems || []).map((li) => ({
      id: li.id,
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      amount: Number(li.amount),
    })),
  };
}

/** Emails every CLIENT-role portal login on this invoice's Client. Returns
 * { ok, recipientCount } — ok is false both when there are zero portal
 * contacts on file (a real, common case for a brand-new client with no
 * portal login yet) and when at least one send genuinely failed; the caller
 * decides how to surface that, this never throws. Pass { reminder: true }
 * for a re-send on an already-outstanding invoice — same template, a
 * "REMINDER" banner and headline instead of "NEW INVOICE". */
function escapeHtmlInline(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Builds the itemized VAT/NHIL/GETFund/COVID-levy <tr> rows for the
 * invoice-notice email template — real tax-settings-derived breakdown, not
 * a lump "tax" number, matching Ghana's invoicing convention of itemizing
 * each component separately. Blank (an "exempt" note row) when the invoice
 * is a genuine export-of-services invoice. */
function buildTaxRowsHtml(invoice) {
  const fmt = (n) => escapeHtmlInline(invoice.currency + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const row = (label, value) =>
    `<tr><td style="font-size:13px;color:#6B7684;padding:4px 0;">${label}</td><td style="font-size:13px;color:#0D2B4E;font-weight:bold;padding:4px 0;">${value}</td></tr>`;
  if (invoice.taxExempt) {
    return row('VAT (0% &middot; export of services)', fmt(0));
  }
  return (
    row('VAT', fmt(invoice.vatAmount || 0)) +
    row('NHIL', fmt(invoice.nhilAmount || 0)) +
    row('GETFund Levy', fmt(invoice.getfundAmount || 0)) +
    row('COVID-19 Levy', fmt(invoice.covidLevyAmount || 0))
  );
}

/** Emails every CLIENT-role portal login on this invoice's Client. Returns
 * { ok, recipientCount } — ok is false both when there are zero portal
 * contacts on file (a real, common case for a brand-new client with no
 * portal login yet) and when at least one send genuinely failed; the caller
 * decides how to surface that, this never throws. Pass { reminder: true }
 * for a re-send on an already-outstanding invoice — same template, a
 * "REMINDER" banner and headline instead of "NEW INVOICE". */
async function notifyInvoiceSent(invoice, { reminder = false } = {}) {
  const portalUsers = await prisma.user.findMany({ where: { clientId: invoice.clientId, role: 'CLIENT' }, include: { client: true } });
  if (!portalUsers.length) return { ok: false, recipientCount: 0 };
  const total = invoice.totalAmount != null ? Number(invoice.totalAmount) : Number(invoice.amount);
  const fmt = (n) => invoice.currency + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dueLabel = invoice.dueDate
    ? new Date(invoice.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'No due date set';
  const clientName = invoice.client ? invoice.client.name : (portalUsers[0].client ? portalUsers[0].client.name : 'there');
  const taxRowsHtml = buildTaxRowsHtml(invoice);
  const results = await Promise.all(
    portalUsers.map((u) =>
      sendEmail({
        to: u.email,
        subject: reminder
          ? `Reminder: invoice outstanding · ${fmt(total)}`
          : `New invoice from OBA · ${fmt(total)}`,
        html: renderEmailTemplate('invoice-notice', {
          PREHEADER: reminder
            ? `Reminder — your ${invoice.period} invoice (${fmt(total)}) is still outstanding.`
            : `Your ${invoice.period} invoice (${fmt(total)}) is ready to view.`,
          BANNER_BG: reminder ? '#FBF3DF' : '#E7F1EC',
          BANNER_FG: reminder ? '#8A6508' : '#2E6B4F',
          BANNER_LABEL: reminder ? 'Reminder' : 'New invoice',
          HEADLINE: reminder ? 'Invoice still outstanding' : 'New invoice',
          CLIENT_NAME: clientName,
          BODY_MESSAGE: reminder
            ? 'The invoice below is still awaiting payment.'
            : 'A new invoice is ready on your account.',
          PERIOD: invoice.period,
          SUBTOTAL: fmt(invoice.amount),
          TAX_ROWS: taxRowsHtml,
          AMOUNT: fmt(total),
          DUE_DATE: dueLabel,
          PORTAL_URL: process.env.APP_URL || 'https://openbaseafrica.com',
        }),
        text: `${reminder ? 'Reminder: ' : ''}Invoice for ${invoice.period}: ${fmt(total)} due ${dueLabel}.`,
      })
    )
  );
  return { ok: results.every((r) => r.ok), recipientCount: portalUsers.length };
}

module.exports = { periodFromDate, effectiveStatus, serializeInvoice, notifyInvoiceSent };
