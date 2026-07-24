const { prisma } = require('../../../../lib/db');
const { requireEmployer } = require('../../../../lib/employer-auth');
const { serializeListing } = require('../../../../lib/jobs');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Employer's own listings only. Every query in every employer route filters
// by the logged-in employer's employerId - this is the load-bearing
// security property of the whole employer feature (see final report).
async function GET(request) {
  const { session, errorResponse } = requireEmployer(request);
  if (errorResponse) return errorResponse;

  const listings = await prisma.jobListing.findMany({
    where: { employerId: session.eid },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { applications: true } } },
  });
  return json({
    jobs: listings.map((l) => ({ ...serializeListing(l), applicationCount: l._count.applications })),
  });
}

async function POST(request) {
  const { session, errorResponse } = requireEmployer(request);
  if (errorResponse) return errorResponse;

  const employer = await prisma.employer.findUnique({ where: { id: session.eid } });
  if (!employer || employer.status !== 'APPROVED') {
    return json({ error: 'Your employer account is not approved to post roles.' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = (body.title || '').trim();
  const branch = (body.branch || '').trim();
  const shift = (body.shift || '').trim();
  const closingDate = body.closingDate ? new Date(body.closingDate) : null;
  const summary = (body.summary || '').trim();
  const description = (body.description || '').trim();
  const requirements = (body.requirements || '').trim();

  const missing = [];
  if (!title) missing.push('title');
  if (!branch) missing.push('branch');
  if (!['DAY', 'NIGHT', 'ROTATING'].includes(shift)) missing.push('shift');
  if (!closingDate || Number.isNaN(closingDate.getTime())) missing.push('closingDate');
  if (!summary) missing.push('summary');
  if (!description) missing.push('description');
  if (!requirements) missing.push('requirements');
  if (missing.length) return json({ error: `Missing/invalid field(s): ${missing.join(', ')}` }, { status: 400 });

  const listing = await prisma.jobListing.create({
    data: {
      title,
      // Always the employer's own registered name, never client-supplied,
      // so one employer can never post a role that appears to come from
      // another company.
      postingCompany: employer.companyName,
      employmentType: (body.employmentType || 'Full-time').trim(),
      branch,
      shift,
      salaryMonth: body.salaryMonth !== undefined && body.salaryMonth !== null && body.salaryMonth !== '' ? Number(body.salaryMonth) : null,
      summary,
      description,
      requirements,
      closingDate,
      employerId: employer.id,
    },
  });

  return json({ job: serializeListing(listing) }, { status: 201 });
}

module.exports = { GET, POST };
