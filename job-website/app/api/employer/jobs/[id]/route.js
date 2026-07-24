const { prisma } = require('../../../../../lib/db');
const { requireEmployer } = require('../../../../../lib/employer-auth');
const { serializeListing } = require('../../../../../lib/jobs');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Every lookup here is scoped to { id, employerId: session.eid } together,
// not id alone - an employer must never be able to read or edit another
// employer's listing by guessing/passing its id.
async function GET(request, { params }) {
  const { session, errorResponse } = requireEmployer(request);
  if (errorResponse) return errorResponse;

  const listing = await prisma.jobListing.findFirst({ where: { id: params.id, employerId: session.eid } });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });
  return json({ job: serializeListing(listing) });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireEmployer(request);
  if (errorResponse) return errorResponse;

  const listing = await prisma.jobListing.findFirst({ where: { id: params.id, employerId: session.eid } });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const data = {};
  if (body.title !== undefined) data.title = String(body.title).trim();
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
  // postingCompany is intentionally never editable here - always the
  // employer's own registered companyName (see POST /api/employer/jobs).

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
