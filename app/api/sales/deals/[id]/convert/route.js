// "Convert to client" — the core Sales<->Client<->Recruitment integration
// the brief calls out as the thing to get right. On a WON deal, this single
// action creates, in ONE transaction:
//   1. a real Client record,
//   2. a real Contract record (type CLIENT) for that client,
//   3. a real JobOpening (Recruitment brief) to start staffing them,
// and links the deal to the new client (Deal.convertedClientId, @unique —
// enforces a deal can only ever be converted once). Optionally also creates
// the Client's first portal login (Role=CLIENT User), if a portalEmail is
// supplied — same generated-temp-password mechanism as
// app/api/employees/onboard, since there's no email infra to send it any
// other way (relayed by hand by whoever runs this, same stopgap as onboarding).
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { SALES_MANAGE } = require('../../../../../../lib/roles');

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
  const { session, errorResponse } = requireRole(request, SALES_MANAGE);
  if (errorResponse) return errorResponse;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional (portalEmail is the only field, and it's optional
    // too) — an empty/invalid JSON body just means "don't create a login
    // yet", not a hard error.
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return json({ error: 'Not found' }, { status: 404 });
  if (deal.stage !== 'WON') {
    return json({ error: 'Only a deal in the Won stage can be converted to a client' }, { status: 400 });
  }
  if (deal.convertedClientId) {
    return json({ error: 'This deal has already been converted to a client' }, { status: 409 });
  }

  const portalEmail = body.portalEmail ? String(body.portalEmail).trim().toLowerCase() : null;
  if (portalEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(portalEmail)) {
      return json({ error: 'That doesn’t look like a valid portal email address' }, { status: 400 });
    }
    const existingUser = await prisma.user.findUnique({ where: { email: portalEmail } });
    if (existingUser) return json({ error: `${portalEmail} already has an account` }, { status: 409 });
  }

  const temporaryPassword = portalEmail ? generateTemporaryPassword() : null;
  const passwordHash = temporaryPassword ? await bcrypt.hash(temporaryPassword, 10) : null;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      // 1. Client
      const client = await tx.client.create({
        data: {
          name: deal.company,
          region: deal.region || 'Ghana',
          industry: deal.serviceDesc,
          currency: deal.currency === '$' ? '$' : 'GH₵',
          status: 'ONBOARDING',
          health: 'GOOD',
        },
      });

      // 2. Contract (client agreement)
      const startDate = new Date();
      const renewalDueDate = new Date(startDate);
      renewalDueDate.setFullYear(renewalDueDate.getFullYear() + 1);
      const contract = await tx.contract.create({
        data: {
          type: 'CLIENT',
          clientId: client.id,
          title: `${deal.company} — Service Agreement`,
          value: deal.valueAmount,
          currency: deal.currency === '$' ? '$' : 'GH₵',
          startDate,
          renewalDueDate,
          status: 'ACTIVE',
          notes: `Auto-created from won deal (${deal.serviceDesc}).`,
          createdByUserId: session.uid,
        },
      });

      // 3. JobOpening (Recruitment brief) — staffing starts immediately.
      const jobOpening = await tx.jobOpening.create({
        data: {
          title: `Support Agent · ${deal.company}`,
          branch: 'Accra HQ',
          status: 'OPEN',
          openings: 1,
          createdByUserId: session.uid,
        },
      });

      // Link the deal to its new client.
      const updatedDeal = await tx.deal.update({
        where: { id: deal.id },
        data: { convertedClientId: client.id, convertedAt: new Date() },
      });

      // Optional: the client's first portal login.
      let portalUser = null;
      if (portalEmail) {
        portalUser = await tx.user.create({
          data: { email: portalEmail, passwordHash, role: 'CLIENT', clientId: client.id },
        });
      }

      return { client, contract, jobOpening, deal: updatedDeal, portalUser };
    });
  } catch (err) {
    console.error('[sales/deals/convert] transaction failed:', err);
    return json({ error: 'Could not convert this deal. Please try again.' }, { status: 500 });
  }

  await logAudit({
    session,
    action: 'DEAL_CONVERTED_TO_CLIENT',
    targetType: 'Deal',
    targetId: deal.id,
    detail: {
      company: deal.company,
      clientId: result.client.id,
      contractId: result.contract.id,
      jobOpeningId: result.jobOpening.id,
      portalUserId: result.portalUser ? result.portalUser.id : null,
      // Never include the password itself in the audit trail.
    },
  });

  return json(
    {
      client: { id: result.client.id, name: result.client.name },
      contract: { id: result.contract.id, title: result.contract.title },
      jobOpening: { id: result.jobOpening.id, title: result.jobOpening.title },
      portalUser: result.portalUser ? { id: result.portalUser.id, email: result.portalUser.email } : null,
      // Only ever visible here, once — same handling as onboarding's own
      // temporary password.
      temporaryPassword,
    },
    { status: 201 }
  );
}

module.exports = { POST };
