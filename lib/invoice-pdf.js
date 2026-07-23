// Real, branded invoice PDF generation (brief: invoices "must be
// downloadable and match company branding"). Built programmatically with
// pdfkit — a pure-JS PDF library with no native binaries — rather than
// Puppeteer/Playwright + a serverless-Chromium build. That route works on
// Vercel too, but a packaged headless-Chromium binary adds real cold-start
// weight to every invocation; pdfkit is a normal npm dependency like
// everything else in this app, with none of that overhead. The tradeoff:
// this file recreates the designed invoice layout with pdfkit's drawing API
// instead of HTML/CSS, so a visual change means editing this file directly.
//
// Font: Helvetica/Helvetica-Bold — pdfkit's built-in, always-available core
// fonts. The design calls for Inter; embedding a custom TTF would add a real
// font-file dependency this app doesn't otherwise carry, so this uses the
// explicitly-sanctioned fallback ("a clean sans-serif ... if Inter isn't
// embeddable").
// Next.js's webpack bundling of this route occasionally wraps a CJS
// module's export under `.default` depending on interop settings — guard
// for both shapes rather than assume one.
const pdfkitModule = require('pdfkit');
const PDFDocument = pdfkitModule.default || pdfkitModule;
const fs = require('fs');
const path = require('path');

const NAVY = '#0D2B4E';
const GOLD = '#C8960C';
const GREEN = '#2E6B4F';
const GREY = '#6B7684';
const LIGHT_GREY = '#9AA4B0';
const DARK_TEXT = '#1F2A37';
const LINE_GREY = '#E3E7EC';
const CARD_BG = '#F5F7FA';
const PILL_BG = '#FBF3DF';
const PILL_FG = '#8A6508';

const LOGO_PATH = path.join(process.cwd(), 'public', 'assets', 'oba-logo-rec.png');

// PDFKit's core fonts (Helvetica etc.) only support WinAnsiEncoding, which
// has no glyph for the Ghana Cedi sign (₵, U+20B5) — rendering it directly
// produces mojibake in the PDF. "GHS " (the ISO 4217 code, a completely
// standard and common way to label Cedi amounts on formal documents) is the
// honest fallback here rather than a garbled symbol; the rest of the app
// (screen UI, emails) still shows the real ₵ symbol since those render in a
// browser with full Unicode font support.
function pdfSafeCurrencyLabel(currency) {
  return currency === 'GH₵' ? 'GHS ' : currency;
}
function fmtMoney(currency, n) {
  return pdfSafeCurrencyLabel(currency) + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/** Builds a real branded invoice PDF from a fully-serialized invoice object
 * (see lib/invoices.js's serializeInvoice, plus clientAddress/bank/account/
 * swift attached by the caller). Returns a Promise<Buffer> — callers await
 * this and set the result directly as a Response body; no stream is ever
 * left open. */
function generateInvoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const contentWidth = right - left;

    // ---- Header: logo left, "INVOICE" + number right ----
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, left, 46, { width: 150 });
      }
    } catch (e) {
      // Never let a missing/corrupt logo asset break PDF generation — the
      // rest of the invoice is still real and correct without it.
    }
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(28).text('INVOICE', left, 44, { width: contentWidth, align: 'right' });
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(invoice.id, left, 78, { width: contentWidth, align: 'right' });

    // Divider: 3px navy full width, with a short gold accent segment at the
    // left edge.
    const dividerY = 104;
    doc.rect(left, dividerY, contentWidth, 3).fill(NAVY);
    doc.rect(left, dividerY, 104, 3).fill(GOLD);

    // ---- Parties block: BILLED TO (left) / Issued+Due+status pill (right) ----
    const partiesY = dividerY + 24;
    doc.fillColor(LIGHT_GREY).font('Helvetica-Bold').fontSize(8).text('BILLED TO', left, partiesY, { characterSpacing: 0.6 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12).text(invoice.clientName || 'Client', left, partiesY + 13);
    if (invoice.clientAddress) {
      doc.fillColor(GREY).font('Helvetica').fontSize(9).text(invoice.clientAddress, left, partiesY + 30, { width: contentWidth / 2 - 20 });
    }

    const rightColX = left + contentWidth / 2 + 20;
    const colWidth = (contentWidth / 2 - 20) / 2;
    doc.fillColor(LIGHT_GREY).font('Helvetica-Bold').fontSize(8).text('ISSUED', rightColX, partiesY, { characterSpacing: 0.6 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(fmtDate(invoice.createdAt), rightColX, partiesY + 12);
    doc.fillColor(LIGHT_GREY).font('Helvetica-Bold').fontSize(8).text('DUE', rightColX + colWidth, partiesY, { characterSpacing: 0.6 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(invoice.dueDate ? fmtDate(invoice.dueDate) : '—', rightColX + colWidth, partiesY + 12);

    const pillLabel = { DRAFT: 'DRAFT', SENT: 'DUE', PAID: 'PAID', OVERDUE: 'OVERDUE' }[invoice.effectiveStatus] || invoice.effectiveStatus;
    doc.font('Helvetica-Bold').fontSize(9);
    const pillTextWidth = doc.widthOfString(pillLabel);
    const pillWidth = pillTextWidth + 22;
    const pillY = partiesY + 34;
    doc.roundedRect(right - pillWidth, pillY, pillWidth, 18, 9).fill(PILL_BG);
    doc.fillColor(PILL_FG).font('Helvetica-Bold').fontSize(9).text(pillLabel, right - pillWidth, pillY + 5, { width: pillWidth, align: 'center' });

    // ---- Line items table ----
    let y = partiesY + 76;
    const colDesc = left;
    const colQty = left + contentWidth * 0.56;
    const colRate = left + contentWidth * 0.68;
    const colAmount = left + contentWidth * 0.83;
    const amountColWidth = right - colAmount;

    doc.fillColor(LIGHT_GREY).font('Helvetica-Bold').fontSize(8);
    doc.text('DESCRIPTION', colDesc, y);
    doc.text('QTY', colQty, y, { width: colRate - colQty, align: 'center' });
    doc.text('RATE', colRate, y, { width: colAmount - colRate, align: 'right' });
    doc.text('AMOUNT', colAmount, y, { width: amountColWidth, align: 'right' });
    y += 14;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(2).strokeColor(NAVY).stroke();
    y += 10;

    const descWidth = colQty - colDesc - 10;
    (invoice.lineItems || []).forEach((li) => {
      const rowTop = y;
      doc.font('Helvetica').fontSize(10);
      const descHeight = doc.heightOfString(li.description, { width: descWidth });
      doc.fillColor(DARK_TEXT).text(li.description, colDesc, rowTop, { width: descWidth });
      let noteHeight = 0;
      if (li.note) {
        doc.font('Helvetica').fontSize(8);
        noteHeight = doc.heightOfString(li.note, { width: descWidth }) + 3;
        doc.fillColor(LIGHT_GREY).text(li.note, colDesc, rowTop + descHeight + 3, { width: descWidth });
      }
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10).text(String(li.quantity), colQty, rowTop, { width: colRate - colQty, align: 'center' });
      doc.fillColor(DARK_TEXT).font('Helvetica').fontSize(10).text(fmtMoney(invoice.currency, li.unitPrice), colRate, rowTop, { width: colAmount - colRate, align: 'right' });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(fmtMoney(invoice.currency, li.amount), colAmount, rowTop, { width: amountColWidth, align: 'right' });

      const rowHeight = Math.max(descHeight + noteHeight, 14) + 14;
      y = rowTop + rowHeight;
      doc.moveTo(left, y - 7).lineTo(right, y - 7).lineWidth(1).strokeColor(LINE_GREY).stroke();
    });

    // ---- Totals block, right-aligned ~2.7in wide ----
    y += 8;
    const totalsWidth = 240;
    const totalsX = right - totalsWidth;
    const totalsLabelWidth = 115;
    const totalsValueWidth = totalsWidth - totalsLabelWidth;

    function totalsRow(label, value, opts = {}) {
      const size = opts.size || 10;
      const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
      doc.font(font).fontSize(size).fillColor(opts.color || GREY).text(label, totalsX, y, { width: totalsLabelWidth });
      doc.font(font).fontSize(size).fillColor(opts.valueColor || DARK_TEXT).text(value, totalsX + totalsLabelWidth, y, { width: totalsValueWidth, align: 'right' });
      y += opts.rowHeight || 15;
    }

    totalsRow('Subtotal', fmtMoney(invoice.currency, invoice.amount));
    if (invoice.taxExempt) {
      totalsRow('VAT (0% · export of services)', fmtMoney(invoice.currency, 0), { size: 8.5 });
    } else {
      totalsRow('VAT', fmtMoney(invoice.currency, invoice.vatAmount), { size: 8.5 });
      totalsRow('NHIL', fmtMoney(invoice.currency, invoice.nhilAmount), { size: 8.5 });
      totalsRow('GETFund Levy', fmtMoney(invoice.currency, invoice.getfundAmount), { size: 8.5 });
      totalsRow('COVID-19 Levy', fmtMoney(invoice.currency, invoice.covidLevyAmount), { size: 8.5 });
    }
    y += 4;
    doc.moveTo(totalsX, y).lineTo(right, y).lineWidth(2).strokeColor(NAVY).stroke();
    y += 8;
    totalsRow('Total due', fmtMoney(invoice.currency, invoice.totalAmount), { bold: true, size: 14, color: NAVY, valueColor: NAVY, rowHeight: 22 });

    // ---- Payment details card ----
    y += 18;
    const cardHeight = 64;
    doc.roundedRect(left, y, contentWidth, cardHeight, 8).fill(CARD_BG);
    const cardPad = 18;
    const cardColWidth = contentWidth / 2 - cardPad * 1.5;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('Open Base Africa Ltd', left + cardPad, y + 16, { width: cardColWidth });
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text(
      `${invoice.bank || 'Ecobank Ghana'}, Account ${invoice.account || '1441 2200 8890'} · SWIFT ${invoice.swift || 'ECOCGHAC'}`,
      left + cardPad, y + 30, { width: cardColWidth }
    );
    const q2X = left + contentWidth / 2 + cardPad * 0.5;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('Questions?', q2X, y + 16, { width: cardColWidth });
    doc.fillColor(GREY).font('Helvetica').fontSize(9).text('accounts@openbaseafrica.com · +233 30 000 0000', q2X, y + 30, { width: cardColWidth });
    y += cardHeight + 22;

    // ---- Closing line ----
    doc.fillColor('#4A5563').font('Helvetica').fontSize(10).text(
      'Thank you for partnering with Open Base Africa. Payment due within terms stated above.',
      left, y, { width: contentWidth, align: 'center' }
    );

    // ---- Footer ----
    const footerY = doc.page.height - doc.page.margins.bottom - 26;
    doc.moveTo(left, footerY).lineTo(right, footerY).lineWidth(1).strokeColor(LINE_GREY).stroke();
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9).text('GLOBAL OPERATIONS. AFRICAN EXECUTION.', left, footerY + 10, { width: contentWidth / 2 });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text('www.openbaseafrica.com', left, footerY + 10, { width: contentWidth, align: 'right' });

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
