const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { RECRUITMENT_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Mirrors the pipeline order shown in the existing Recruitment screen's
// column layout (Applied / Screening / Interview / Offer) — Hired is
// deliberately NOT reachable from here, it only ever happens through the
// dedicated one-click hire/convert-to-employee endpoint below.
const STAGE_ORDER = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER'];

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, RECRUITMENT_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = body.action;
  if (!['advance', 'reject'].includes(action)) {
    return json({ error: "action must be 'advance' or 'reject'" }, { status: 400 });
  }

  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) return json({ error: 'Not found' }, { status: 404 });
  if (candidate.stage === 'HIRED' || candidate.stage === 'REJECTED') {
    return json({ error: `Candidate is already ${candidate.stage.toLowerCase()} — no further stage changes` }, { status: 400 });
  }

  let nextStage;
  if (action === 'reject') {
    nextStage = 'REJECTED';
  } else {
    const idx = STAGE_ORDER.indexOf(candidate.stage);
    if (idx === -1 || idx === STAGE_ORDER.length - 1) {
      return json({ error: 'Candidate is at Offer stage — use POST /api/recruitment/candidates/:id/hire to convert to an employee' }, { status: 400 });
    }
    nextStage = STAGE_ORDER[idx + 1];
  }

  const updated = await prisma.candidate.update({ where: { id: candidate.id }, data: { stage: nextStage } });

  await logAudit({
    session,
    action: action === 'reject' ? 'CANDIDATE_REJECTED' : 'CANDIDATE_ADVANCED',
    targetType: 'Candidate',
    targetId: updated.id,
    detail: { from: candidate.stage, to: updated.stage, name: candidate.name },
  });

  return json({ candidate: updated });
}

module.exports = { PATCH };
