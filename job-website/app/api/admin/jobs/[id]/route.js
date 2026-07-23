const { prisma } = require('../../../../../lib/db');
const { requireAdmin } = require('../../../../../lib/auth');
const { serializeListing } = require('../../../../../lib/jobs');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });
  return json({ job: serializeListing(listing) });
}

// Edit / close / reopen / "repost" (reopen with a fresh closing date) a
// listing. A single PATCH endpoint driven by whichever fields are present in
// the body keeps the admin UI simple (one form, a few action buttons) while
// still being real writes to real columns, not a status toggle pretending
// to be a repost.
async function PATCH(request, { params }) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
  if (body.postingCompany !== undefined) data.postingCompany = String(body.postingCompany).trim();
  if (body.employmentType !== undefined) data.employmentType = String(body.employmentType).trim();
  if (body.branch !== undefined) data.branch = String(body.branch).trim();
  if (body.shift !== undefined) {
    if (!['DAY', 'NIGHT', 'ROTATING'].includes(body.shift)) return json({ error: 'Invalid shift' }, { status: 400 });
    data.shift = body.shift;
  }
  if (body.salaryMonth !== undefined) {
    data.salaryMonth = body.salaryMonth === null || body.salaryMonth === '' ? null : Number(body.salaryMonth);
  }
  if (body.summary !== undefined) data.summary = String(body.summary).trim();
  if (body.description !== undefined) data.description = String(body.description).trim();
  if (body.requirements !== undefined) data.requirements = String(body.requirements).trim();
  if (body.closingDate !== undefined) {
    const d = new Date(body.closingDate);
    if (Number.isNaN(d.getTime())) return json({ error: 'Invalid closingDate' }, { status: 400 });
    data.closingDate = d;
  }

  // Actions: close / reopen (repost). "repost" reopens AND pushes the
  // closing date forward if the client didn't already supply a new one, so
  // reposting a long-expired role doesn't reopen it only to auto-expire
  // again immediately.
  if (body.action === 'close') {
    data.status = 'CLOSED';
  } else if (body.action === 'reopen' || body.action === 'repost') {
    data.status = 'OPEN';
    if (body.closingDate === undefined) {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      data.closingDate = future;
    }
  }

  const updated = await prisma.jobListing.update({ where: { id: params.id }, data });
  return json({ job: serializeListing(updated) });
}

module.exports = { GET, PATCH };
