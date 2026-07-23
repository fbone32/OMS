// "Add Employee" / new-hire onboarding — the real replacement for hand-
// entering people into the database. In one transaction this creates the
// Employee record (basics only — salary/banking/national ID are optional,
// fillable later by HR through the existing employee-edit screen) AND the
// linked User login, with a freshly generated, unique, per-person temporary
// password. That plaintext password is returned in this response ONCE — it
// is never logged, never stored — but IS now also emailed (via lib/email)
// directly to the new hire, same real-email upgrade every other "log
// instead of send" stopgap in this codebase got. The admin who submits this
// form still sees the temp password once too (sendEmail fails soft, so if
// RESEND_API_KEY isn't configured the admin relaying it by hand is still the
// working fallback, not a broken flow).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { sendEmail } = require('../../../../lib/email');
const { renderEmailTemplate } = require('../../../../lib/email-templates');
const { ACCOUNT_CREATE, ONBOARDING_ASSIGNABLE_ROLES } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

/** Cryptographically random temporary password — Node's crypto, never
 * Math.random. 15 base64url characters (~90 bits of entropy) drawn straight
 * from random bytes, no shared/guessable default. */
function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString('base64url'); // 16 chars, [A-Za-z0-9_-]
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, ACCOUNT_CREATE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  const jobTitle = (body.jobTitle || '').trim();
  const branch = (body.branch || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const role = (body.role || '').trim();
  const nationalId = body.nationalId ? String(body.nationalId).trim() : null;

  const missing = [];
  if (!name) missing.push('name');
  if (!jobTitle) missing.push('jobTitle');
  if (!branch) missing.push('branch');
  if (!email) missing.push('email');
  if (!role) missing.push('role');
  if (missing.length) return json({ error: `Missing field(s): ${missing.join(', ')}` }, { status: 400 });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'That doesn’t look like a valid email address' }, { status: 400 });
  }

  // System-access Role is deliberately a smaller, curated set than the full
  // Prisma Role enum — DIRECTOR/BOARD_ADVISOR stay seed/admin-only, CLIENT is
  // a different account type entirely. Enforced server-side regardless of
  // what the client's <select> happens to send.
  if (!ONBOARDING_ASSIGNABLE_ROLES.includes(role)) {
    return json({ error: `Role must be one of: ${ONBOARDING_ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 });
  }

  // Check-before-create is a fast, friendly path for the common case; the
  // transaction below still has to tolerate a concurrent duplicate (two
  // admins submitting the same email at once) via a caught P2002.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return json({ error: `${email} already has an account` }, { status: 409 });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          name,
          jobTitle,
          branch,
          startDate: body.startDate ? new Date(body.startDate) : new Date(),
          nationalId: nationalId || null,
          // Financial/banking fields are intentionally left unset here — HR
          // fills these in later via the employee record, per the brief.
        },
      });
      const user = await tx.user.create({
        data: { email, passwordHash, role, employeeId: employee.id },
      });
      return { employee, user };
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return json({ error: `${email} already has an account` }, { status: 409 });
    }
    console.error('[employees/onboard] failed to create account:', err);
    return json({ error: 'Could not create the account. Please try again.' }, { status: 500 });
  }

  await logAudit({
    session,
    action: 'ACCOUNT_ONBOARDED',
    targetType: 'User',
    targetId: created.user.id,
    detail: {
      employeeId: created.employee.id,
      name: created.employee.name,
      email: created.user.email,
      role: created.user.role,
      branch: created.employee.branch,
      jobTitle: created.employee.jobTitle,
      // Never include the password itself in the audit trail.
    },
  });

  const origin = request.headers.get('origin') || '';
  const emailResult = await sendEmail({
    to: email,
    subject: 'Welcome to OBA Platform — your login details',
    html: renderEmailTemplate('onboarding-welcome', {
      USER_FIRST_NAME: name.split(' ')[0],
      JOB_TITLE: jobTitle,
      BRANCH: branch,
      USER_EMAIL: email,
      TEMP_PASSWORD: temporaryPassword,
      SIGN_IN_URL: origin || 'https://openbaseafrica.com',
    }),
    text: `Welcome to OBA Platform. Email: ${email} · Temporary password: ${temporaryPassword}. Please sign in and change it as soon as possible.`,
  });
  if (!emailResult.ok) {
    console.error(`[employees/onboard] welcome email not sent to ${email}: ${emailResult.error}`);
  }

  return json(
    {
      employee: {
        id: created.employee.id,
        name: created.employee.name,
        jobTitle: created.employee.jobTitle,
        branch: created.employee.branch,
      },
      user: { id: created.user.id, email: created.user.email, role: created.user.role },
      // Only ever visible here, once. The caller must show it to the admin
      // now and never persist it anywhere. emailSent tells the admin UI
      // whether it also needs to relay this by hand (Resend not configured
      // or the send failed) or whether the new hire already has it in
      // their inbox.
      temporaryPassword,
      emailSent: emailResult.ok,
    },
    { status: 201 }
  );
}

module.exports = { POST };
