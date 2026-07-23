// Move a deal through the 5-stage board (New Enquiry -> Qualified ->
// Proposal Sent -> Negotiation -> Won/Lost), or edit its basics. Mirrors
// app/api/recruitment/candidates/[id]/route.js's advance/reject shape.
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { SALES_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

const STAGE_ORDER = ['NEW_ENQUIRY', 'QUALIFIED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON'];

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, SALES_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return json({ error: 'Not found' }, { status: 404 });
  if (['WON', 'LOST'].includes(deal.stage)) {
    return json({ error: `Deal is already ${deal.stage} — no further stage changes` }, { status: 400 });
  }

  const action = body.action;
  if (action && !['advance', 'lost'].includes(action)) {
    return json({ error: "action must be 'advance' or 'lost'" }, { status: 400 });
  }

  let data = {};
  if (action === 'lost') {
    data = { stage: 'LOST', lostReason: body.lostReason || null };
  } else if (action === 'advance') {
    const idx = STAGE_ORDER.indexOf(deal.stage);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) {
      return json({ error: 'Deal is already at Won — nothing further to advance' }, { status: 400 });
    }
    data = { stage: STAGE_ORDER[idx + 1] };
  } else {
    // Plain field edit (no stage change) — company/contact/value details.
    const editable = ['company', 'contactName', 'contactEmail', 'contactPhone', 'region', 'serviceDesc', 'currency', 'source'];
    for (const f of editable) if (f in body) data[f] = body[f];
    if ('valueAmount' in body) data.valueAmount = body.valueAmount === '' ? null : body.valueAmount;
    if (!Object.keys(data).length) return json({ error: 'Nothing to update' }, { status: 400 });
  }

  const updated = await prisma.deal.update({ where: { id: deal.id }, data });

  await logAudit({
    session,
    action: action === 'lost' ? 'DEAL_LOST' : action === 'advance' ? 'DEAL_ADVANCED' : 'DEAL_UPDATED',
    targetType: 'Deal',
    targetId: updated.id,
    detail: { from: deal.stage, to: updated.stage, company: deal.company },
  });

  return json({
    deal: {
      id: updated.id,
      company: updated.company,
      stage: updated.stage,
      lostReason: updated.lostReason,
      valueAmount: updated.valueAmount != null ? Number(updated.valueAmount) : null,
    },
  });
}

module.exports = { PATCH };
