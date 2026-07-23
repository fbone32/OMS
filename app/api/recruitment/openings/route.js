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

function serialize(o) {
  return {
    id: o.id,
    title: o.title,
    branch: o.branch,
    status: o.status,
    openings: o.openings,
    createdAt: o.createdAt,
  };
}

// Not wired to a dedicated frontend control — the existing Recruitment
// screen has no job-opening list/create UI element (only the candidate
// pipeline board), so this is verified directly via curl instead, same as
// app/api/attendance/[id]'s correction endpoint. See final report.
async function GET(request) {
  const { errorResponse } = requireRole(request, RECRUITMENT_VIEW);
  if (errorResponse) return errorResponse;

  const openings = await prisma.jobOpening.findMany({ orderBy: { createdAt: 'desc' } });
  return json({ openings: openings.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, RECRUITMENT_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const title = (body.title || '').trim();
  const branch = (body.branch || '').trim();
  if (!title || !branch) return json({ error: 'title and branch are required' }, { status: 400 });

  const opening = await prisma.jobOpening.create({
    data: {
      title,
      branch,
      openings: body.openings ? Number(body.openings) : 1,
      createdByUserId: session.uid,
    },
  });

  await logAudit({ session, action: 'JOB_OPENING_CREATED', targetType: 'JobOpening', targetId: opening.id, detail: { title, branch } });

  return json({ opening: serialize(opening) }, { status: 201 });
}

module.exports = { GET, POST };
