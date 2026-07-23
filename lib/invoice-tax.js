// Real invoice tax calculation — rates are NEVER hard-coded here, they are
// always read from the InvoiceTaxSettings row (a real, editable database
// table), same compliance principle as lib/payroll.js's PayrollSettings
// read. This module only implements the calculation shape; the numbers
// themselves live in the DB and can be changed by an authorized role
// (Director/Accountant) without a code deploy — see
// app/api/finance/tax-settings.
//
// PLACEHOLDER RATES + CALCULATION DISCLAIMER: the rates seeded into
// InvoiceTaxSettings are illustrative Ghana VAT/NHIL/GETFund/COVID levy
// figures for demo purposes only and have NOT been signed off by an
// accountant or tax advisor. The computation below applies each rate
// independently to the invoice subtotal (simplified, non-compounding).
// Ghana's real VAT Flat Rate Scheme may compound these differently (e.g.
// VAT charged on subtotal+levies rather than the subtotal alone) — that
// exact order has NOT been verified against current GRA guidance. Do not
// rely on this for a real invoice's tax line without review — same
// "needs real sign-off" category as PayrollSettings' SSNIT/PAYE rates.
function toNumber(decimalOrNumber) {
  if (decimalOrNumber == null) return 0;
  return typeof decimalOrNumber === 'object' && typeof decimalOrNumber.toNumber === 'function'
    ? decimalOrNumber.toNumber()
    : Number(decimalOrNumber);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {number} subtotal — pre-tax invoice amount (sum of line items)
 * @param {boolean} taxExempt — true for an export-of-services invoice (no
 *   VAT/levies apply); false for a standard-rated domestic invoice
 * @param {object} settings — the current InvoiceTaxSettings row
 * @returns {{ vatAmount, nhilAmount, getfundAmount, covidLevyAmount, totalAmount }}
 */
function computeInvoiceTax(subtotal, taxExempt, settings) {
  if (taxExempt || !settings) {
    return { vatAmount: 0, nhilAmount: 0, getfundAmount: 0, covidLevyAmount: 0, totalAmount: round2(subtotal) };
  }
  const vatAmount = round2(subtotal * (toNumber(settings.vatRatePct) / 100));
  const nhilAmount = round2(subtotal * (toNumber(settings.nhilRatePct) / 100));
  const getfundAmount = round2(subtotal * (toNumber(settings.getfundRatePct) / 100));
  const covidLevyAmount = round2(subtotal * (toNumber(settings.covidLevyRatePct) / 100));
  const totalAmount = round2(subtotal + vatAmount + nhilAmount + getfundAmount + covidLevyAmount);
  return { vatAmount, nhilAmount, getfundAmount, covidLevyAmount, totalAmount };
}

module.exports = { computeInvoiceTax, toNumber };
