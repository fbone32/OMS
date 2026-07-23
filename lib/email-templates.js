// Branded HTML email templates for lib/email.js's sendEmail(). Every real
// email this app sends renders one of the full standalone HTML documents in
// lib/email-templates/ — matching the OBA Platform design system (navy
// #0D2B4E header with the "OPEN BASE AFRICA" wordmark, a 4px #C8960C gold
// accent bar, Arial/Helvetica email-safe font stack, #F5F7FA/#EEF1F5 light
// callout backgrounds, and a consistent "Global Operations. African
// Execution." footer) instead of a bare-bones plain notification. This
// mirrors two reference templates already produced for this project
// (applicant-confirmation.html, status-change.html) — same {{PLACEHOLDER}}
// convention, same simple string-substitution templating, no new
// templating dependency.
const fs = require('fs');
const path = require('path');

const cache = new Map();

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Reads lib/email-templates/<name>.html (cached in memory after the first
 * read — these files never change at runtime) and replaces every
 * {{KEY}} token with vars[KEY], HTML-escaped since values can include
 * user-supplied names/notes. Any token with no matching var renders as an
 * empty string rather than leaking a raw {{TOKEN}} into a sent email.
 * Tokens whose name ends in `_ROWS` or `_HTML` are a deliberate exception —
 * inserted as-is, never escaped — used only for small blocks of trusted,
 * code-generated markup (e.g. a variable number of table rows) that no
 * template author or user input ever controls the contents of. */
function renderEmailTemplate(name, vars) {
  let template = cache.get(name);
  if (!template) {
    // process.cwd(), not __dirname: when this module is bundled by
    // webpack for an API route (Next.js does this for every serverless
    // function), __dirname resolves to the BUNDLED output location, not
    // this file's real location on disk — the same class of "reads a file
    // relative to itself" break pdfkit hits with its .afm font metrics
    // (see next.config.js's serverComponentsExternalPackages comment).
    // process.cwd() is the project root in both `next dev` and on Vercel,
    // so this path is stable regardless of how/where webpack bundles the
    // calling module.
    template = fs.readFileSync(path.join(process.cwd(), 'lib', 'email-templates', `${name}.html`), 'utf8');
    cache.set(name, template);
  }
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const raw = vars ? vars[key] : undefined;
    if (/_ROWS$|_HTML$/.test(key)) return raw == null ? '' : String(raw);
    return escapeHtml(raw);
  });
}

module.exports = { renderEmailTemplate };
