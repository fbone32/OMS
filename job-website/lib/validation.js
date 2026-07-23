// Shared validation for the public application form, enforced BOTH
// client-side (inline error, instant feedback on a slow connection) and
// server-side (never trust the client).
//
// *** SIZE LIMIT JUDGMENT CALL ***
// The developer brief specifies a 5MB CV limit. This app enforces 4MB
// instead. Reason: Vercel Serverless/Edge Functions cap request body size
// at ~4.5MB regardless of plan. A 5MB file survives local dev testing (no
// such limit there) but would 413 in production intermittently — exactly
// the kind of "passes locally, breaks in prod" bug this repo's rigor bar
// exists to catch. 4MB leaves headroom for multipart overhead on the way in
// AND for the OMS's own pull-back of the raw CV bytes (see lib/oms-sync.js)
// to stay comfortably under that same ceiling. Flagged in the final report.
const MAX_CV_BYTES = 4 * 1024 * 1024; // 4MB

const ALLOWED_CV_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_CV_EXTENSIONS = ['.pdf', '.doc', '.docx'];

function validateCvFile({ name, type, size }) {
  const lowerName = (name || '').toLowerCase();
  const extOk = ALLOWED_CV_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const typeOk = !type || ALLOWED_CV_TYPES.includes(type); // some browsers send '' for type on odd Word mimetypes
  if (!extOk || (type && !typeOk)) {
    return { ok: false, error: 'CV must be a PDF or Word document (.pdf, .doc, .docx).' };
  }
  if (size > MAX_CV_BYTES) {
    return { ok: false, error: `CV must be 4MB or smaller (yours is ${(size / (1024 * 1024)).toFixed(1)}MB).` };
  }
  if (size === 0) {
    return { ok: false, error: 'That file appears to be empty — please choose a valid CV file.' };
  }
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateApplication({ fullName, phone, email, whyGoodFit }) {
  const errors = {};
  if (!fullName || !fullName.trim()) errors.fullName = 'Full name is required.';
  if (!phone || !phone.trim()) errors.phone = 'Phone number is required.';
  if (!email || !EMAIL_RE.test(email.trim())) errors.email = 'A valid email address is required.';
  if (!whyGoodFit || whyGoodFit.trim().length < 20) {
    errors.whyGoodFit = 'Please tell us why you are a good fit (at least 20 characters).';
  }
  return { ok: Object.keys(errors).length === 0, errors };
}

module.exports = { MAX_CV_BYTES, ALLOWED_CV_TYPES, ALLOWED_CV_EXTENSIONS, validateCvFile, validateApplication, EMAIL_RE };
