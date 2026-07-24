const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { checkRateLimit, clientIp } = require('../../../../lib/rate-limit');
const { EMAIL_RE } = require('../../../../lib/validation');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

const VALID_PLANS = ['starter', 'growth', 'enterprise'];

// Public employer registration. Creates a real PENDING Employer row - no
// employer can log in or post a role until an HR admin approves it (see
// app/api/admin/employers/[id]/route.js). No payment/checkout here by
// design; planTier is informational only for Phase 2.
async function POST(request) {
  const ip = clientIp(request);
  const allowed = await checkRateLimit(`employer-register:${ip}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!allowed) return json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const companyName = (body.companyName || '').trim();
  const contactName = (body.contactName || '').trim();
  const contactEmail = (body.contactEmail || '').trim().toLowerCase();
  const contactPhone = (body.contactPhone || '').trim();
  const loginEmail = (body.loginEmail || '').trim().toLowerCase();
  const password = (body.password || '').toString();
  const planTier = VALID_PLANS.includes(body.planTier) ? body.planTier : 'starter';

  const errors = {};
  if (!companyName) errors.companyName = 'Company name is required.';
  if (!contactName) errors.contactName = 'Contact name is required.';
  if (!contactEmail || !EMAIL_RE.test(contactEmail)) errors.contactEmail = 'A valid contact email is required.';
  if (!contactPhone) errors.contactPhone = 'Contact phone is required.';
  if (!loginEmail || !EMAIL_RE.test(loginEmail)) errors.loginEmail = 'A valid login email is required.';
  if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (Object.keys(errors).length) {
    return json({ error: 'Please fix the highlighted fields.', fieldErrors: errors }, { status: 400 });
  }

  const existing = await prisma.employer.findUnique({ where: { loginEmail } });
  if (existing) {
    return json(
      { error: 'An employer account with this login email already exists.', fieldErrors: { loginEmail: 'Already registered.' } },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let employer;
  try {
    employer = await prisma.employer.create({
      data: { companyName, contactName, contactEmail, contactPhone, loginEmail, passwordHash, planTier },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return json(
        { error: 'An employer account with this login email already exists.', fieldErrors: { loginEmail: 'Already registered.' } },
        { status: 409 }
      );
    }
    console.error('[employer register] failed to create employer', err);
    return json({ error: 'Something went wrong saving your registration. Please try again.' }, { status: 500 });
  }

  return json({ ok: true, employerId: employer.id }, { status: 201 });
}

module.exports = { POST };
