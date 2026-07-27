const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { RECRUITMENT_VIEW, RECRUITMENT_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    jobOpeningId: c.jobOpeningId,
    roleTitle: c.roleTitle,
    stage: c.stage,
    experience: c.experience,
    education: c.education,
    notes: c.notes,
    appliedAt: c.appliedAt,
    convertedEmployeeId: c.convertedEmployeeId,
    // The full application as submitted externally (job-website applicants
    // only - internally-added candidates have none of these). cvDataUrl
    // itself is deliberately left out of this list payload (can be
    // megabytes) - the UI fetches actual bytes on demand from
    // GET /api/recruitment/candidates/:id/cv.
    coverLetter: c.coverLetter,
    cvFileName: c.cvFileName,
    hasCv: !!c.cvDataUrl,
    source: c.source,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, RECRUITMENT_VIEW);
  if (errorResponse) return errorResponse;

  const candidates = await prisma.candidate.findMany({ orderBy: { appliedAt: 'desc' } });
  return json({ candidates: candidates.map(serialize) });
}

// Not wired to a "New candidate" form — the existing Recruitment screen's
// pipeline board (funnel + stage columns) has no create-candidate control,
// only advance/reject/view on cards already in the pipeline (candidates
// arrive from the job board per the screen's own "Live feed connected" note).
// Verified directly via curl instead, same as app/api/attendance/[id].
async function POST(request) {
  const { session, errorResponse } = requireRole(request, RECRUITMENT_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const roleTitle = (body.roleTitle || '').trim();
  const missing = [];
  if (!name) missing.push('name');
  if (!email) missing.push('email');
  if (!roleTitle) missing.push('roleTitle');
  if (missing.length) return json({ error: `Missing field(s): ${missing.join(', ')}` }, { status: 400 });

  let jobOpeningId = null;
  if (body.jobOpeningId) {
    const opening = await prisma.jobOpening.findUnique({ where: { id: body.jobOpeningId } });
    if (!opening) return json({ error: 'Job opening not found' }, { status: 400 });
    jobOpeningId = opening.id;
  }

  const candidate = await prisma.candidate.create({
    data: {
      name,
      email,
      phone: body.phone || null,
      jobOpeningId,
      roleTitle,
      experience: body.experience || null,
      education: body.education || null,
      notes: body.notes || null,
    },
  });

  await logAudit({ session, action: 'CANDIDATE_ADDED', targetType: 'Candidate', targetId: candidate.id, detail: { name, roleTitle } });

  return json({ candidate: serialize(candidate) }, { status: 201 });
}

module.exports = { GET, POST };
