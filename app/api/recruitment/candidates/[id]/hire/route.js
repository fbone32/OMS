// One-click "hire" conversion — the real replacement for manually re-keying
// a hired candidate into Employee Records. Reuses the exact same pattern as
// app/api/employees/onboard/route.js: one transaction creates the Employee
// record AND the linked User login with a freshly generated, unique,
// per-person temporary password, returned once in the response and never
// logged/stored/emailed (see that route's own comment for why).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { RECRUITMENT_MANAGE, ONBOARDING_ASSIGNABLE_ROLES } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString('base64url');
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, RECRUITMENT_MANAGE);
  if (errorResponse) return errorResponse;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional here — jobTitle/branch/role/startDate all have
    // sensible fallbacks derived from the candidate record below.
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) return json({ error: 'Not found' }, { status: 404 });
  if (candidate.stage !== 'OFFER') {
    return json({ error: 'Candidate must be at the Offer stage before converting to an employee' }, { status: 400 });
  }
  if (candidate.convertedEmployeeId) {
    return json({ error: 'This candidate has already been converted to an employee' }, { status: 409 });
  }

  const role = (body.role || 'EMPLOYEE').trim();
  if (!ONBOARDING_ASSIGNABLE_ROLES.includes(role)) {
    return json({ error: `Role must be one of: ${ONBOARDING_ASSIGNABLE_ROLES.join(', ')}` }, { status: 400 });
  }
  const jobTitle = (body.jobTitle || candidate.roleTitle || '').trim();
  const branch = (body.branch || '').trim();
  if (!jobTitle) return json({ error: 'jobTitle is required (candidate has no roleTitle to fall back on)' }, { status: 400 });
  if (!branch) return json({ error: 'branch is required' }, { status: 400 });

  const existingUser = await prisma.user.findUnique({ where: { email: candidate.email } });
  if (existingUser) {
    return json({ error: `${candidate.email} already has an account` }, { status: 409 });
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          name: candidate.name,
          jobTitle,
          branch,
          startDate: body.startDate ? new Date(body.startDate) : new Date(),
        },
      });
      const user = await tx.user.create({
        data: { email: candidate.email, passwordHash, role, employeeId: employee.id },
      });
      const updatedCandidate = await tx.candidate.update({
        where: { id: candidate.id },
        data: { stage: 'HIRED', convertedEmployeeId: employee.id },
      });
      return { employee, user, candidate: updatedCandidate };
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return json({ error: `${candidate.email} already has an account` }, { status: 409 });
    }
    console.error('[recruitment/hire] failed to convert candidate:', err);
    return json({ error: 'Could not convert this candidate. Please try again.' }, { status: 500 });
  }

  await logAudit({
    session,
    action: 'CANDIDATE_HIRED',
    targetType: 'Candidate',
    targetId: created.candidate.id,
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

  return json(
    {
      candidate: created.candidate,
      employee: { id: created.employee.id, name: created.employee.name, jobTitle: created.employee.jobTitle, branch: created.employee.branch },
      user: { id: created.user.id, email: created.user.email, role: created.user.role },
      temporaryPassword,
    },
    { status: 201 }
  );
}

module.exports = { POST };
