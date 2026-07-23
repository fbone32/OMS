// Payroll math. Statutory rates are NEVER hard-coded here — they are always
// read from the PayrollSettings row (a real, editable database table), per
// the brief's compliance requirement. This module only implements the
// calculation shape; the numbers themselves live in the DB and can be
// changed by an authorized role without a code deploy.
//
// PLACEHOLDER RATES DISCLAIMER: the rates seeded into PayrollSettings are
// plausible current-ish Ghana SSNIT/PAYE figures for demo purposes only and
// have NOT been signed off by an accountant. Do not run real payroll against
// them without review — see seed script + final report.

function toNumber(decimalOrNumber) {
  if (decimalOrNumber == null) return 0;
  return typeof decimalOrNumber === 'object' && typeof decimalOrNumber.toNumber === 'function'
    ? decimalOrNumber.toNumber()
    : Number(decimalOrNumber);
}

/** PAYE bands are cumulative monthly GHS bands, e.g.
 *  [{ upTo: 490, rate: 0 }, { upTo: 600, rate: 5 }, ..., { upTo: null, rate: 35 }]
 *  `upTo` is the cumulative ceiling for that band (null = no ceiling / top band).
 *  `rate` is a percentage applied to the slice of income within that band. */
function calculatePaye(taxableIncome, payeBands) {
  let remaining = Math.max(0, taxableIncome);
  let tax = 0;
  let floor = 0;
  for (const band of payeBands) {
    const ceiling = band.upTo == null ? Infinity : band.upTo;
    const bandWidth = ceiling - floor;
    const sliceInBand = Math.max(0, Math.min(remaining, bandWidth));
    tax += sliceInBand * (band.rate / 100);
    remaining -= sliceInBand;
    floor = ceiling;
    if (remaining <= 0) break;
  }
  return tax;
}

/** Computes one employee's payslip figures from gross/overtime/deductions and
 * the currently-effective PayrollSettings row. Returns numbers (not Decimal),
 * rounded to 2dp. */
function computePayslip({ grossPay, overtimePay = 0, otherDeductions = 0 }, settings) {
  const gross = toNumber(grossPay);
  const ot = toNumber(overtimePay);
  const ded = toNumber(otherDeductions);
  const ssnitEmployeeRate = toNumber(settings.ssnitEmployeeRatePct);
  const ssnitEmployerRate = toNumber(settings.ssnitEmployerRatePct);
  const payeBands = settings.payeBands;

  // SSNIT is calculated on basic (gross) pay, consistent with SSNIT practice.
  const ssnitEmployee = gross * (ssnitEmployeeRate / 100);
  const ssnitEmployer = gross * (ssnitEmployerRate / 100);

  const taxableIncome = Math.max(0, gross + ot - ssnitEmployee);
  const payeTax = calculatePaye(taxableIncome, payeBands);

  const netPay = gross + ot - ssnitEmployee - payeTax - ded;

  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    grossPay: round2(gross),
    overtimePay: round2(ot),
    otherDeductions: round2(ded),
    ssnitEmployee: round2(ssnitEmployee),
    ssnitEmployer: round2(ssnitEmployer),
    payeTax: round2(payeTax),
    netPay: round2(netPay),
  };
}

module.exports = { calculatePaye, computePayslip, toNumber };
