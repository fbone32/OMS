const { prisma } = require('../../../../../lib/db');
const { requireAdmin } = require('../../../../../lib/auth');
const { sendEmail, employerApprovedEmail, employerRejectedEmail } = require('../../../../../lib/email');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Approve / reject / suspend an employer registration. A real email is sent
// on approve/reject, but a failed send NEVER blocks the status change - the
// approval itself is the source of truth (the employer can already log in
// the moment this request returns), matching the same fail-soft-email
// contract as the public apply route's confirmation email.
async function PATCH(request, { params }) {
  const { session, errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  const employer = await prisma.employer.findUnique({ where: { id: params.id } });
  if (!employer) return json({ error: 'Employer not found' }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action;
  const VALID_ACTIONS = ['approve', 'reject', 'suspend', 'reinstate'];
  if (!VALID_ACTIONS.includes(action)) {
    return json({ error: `action must be one of: ${VALID_ACTIONS.join(', ')}` }, { status: 400 });
  }

  const data = {};
  if (action === 'approve') {
    data.status = 'APPROVED';
    data.approvedById = session.uid;
    data.approvedAt = new Date();
    data.rejectedReason = null;
  } else if (action === 'reject') {
    data.status = 'REJECTED';
    data.rejectedReason = (body.reason || '').trim() || null;
  } else if (action === 'suspend') {
    data.status = 'SUSPENDED';
  } else if (action === 'reinstate') {
    data.status = 'APPROVED';
  }

  const updated = await prisma.employer.update({ where: { id: params.id }, data });

  let emailResult = { ok: true, skipped: true };
  if (action === 'approve') {
    const { subject, html, text } = employerApprovedEmail({ companyName: updated.companyName });
    emailResult = await sendEmail({ to: updated.contactEmail, subject, html, text });
  } else if (action === 'reject') {
    const { subject, html, text } = employerRejectedEmail({ companyName: updated.companyName, reason: updated.rejectedReason });
    emailResult = await sendEmail({ to: updated.contactEmail, subject, html, text });
  }
  if (!emailResult.ok && !emailResult.skipped) {
    console.error(`[admin employers] notification email failed for employer ${updated.id} (action=${action}):`, emailResult.error);
  }

  return json({
    employer: { id: updated.id, status: updated.status, approvedAt: updated.approvedAt, rejectedReason: updated.rejectedReason },
    emailSent: emailResult.skipped ? null : emailResult.ok,
  });
}

module.exports = { PATCH };
