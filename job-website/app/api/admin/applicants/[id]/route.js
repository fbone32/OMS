const { prisma } = require('../../../../../lib/db');
const { requireAdmin } = require('../../../../../lib/auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

const VALID_STATUSES = ['NEW', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];

// Moves a candidate between statuses in the job-website's OWN lightweight
// tracker. NOTE (Phase 1 boundary, see final report): this does NOT push
// the status change back into the OMS's Candidate.stage — the OMS's own
// existing Recruitment pipeline board remains the single source of truth
// for hire decisions and stage progression once a candidate has been synced
// there; this status is a fast local triage view for the job-website admin
// (e.g. "have I looked at this one yet") so they don't need to switch tools
// for a first pass. Real bidirectional sync is a reasonable Phase 2 item.
async function PATCH(request, { params }) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!VALID_STATUSES.includes(body.status)) {
    return json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
  }

  const existing = await prisma.jobApplication.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Applicant not found' }, { status: 404 });

  const updated = await prisma.jobApplication.update({
    where: { id: params.id },
    data: { status: body.status },
  });

  return json({ applicant: { id: updated.id, status: updated.status } });
}

module.exports = { PATCH };
