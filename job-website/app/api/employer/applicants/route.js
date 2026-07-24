const { prisma } = require('../../../../lib/db');
const { requireEmployer } = require('../../../../lib/employer-auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(a) {
  return {
    id: a.id,
    jobListingId: a.jobListingId,
    jobTitle: a.jobListing.title,
    branch: a.jobListing.branch,
    fullName: a.fullName,
    phone: a.phone,
    email: a.email,
    whyGoodFit: a.whyGoodFit,
    cvFileName: a.cvFileName,
    status: a.status,
    createdAt: a.createdAt,
  };
}

// Applicants for THIS employer's own listings only. The `jobListing:
// { employerId: session.eid }` relation filter below is the entire security
// boundary here - an employer must never see another company's applicants,
// even by passing a jobListingId that isn't theirs (the relation filter
// excludes it either way, it never falls back to an unscoped query).
async function GET(request) {
  const { session, errorResponse } = requireEmployer(request);
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || '').trim();
  const jobListingId = (searchParams.get('jobListingId') || '').trim();

  const where = { jobListing: { employerId: session.eid } };
  if (status) where.status = status;
  if (jobListingId) where.jobListingId = jobListingId;

  const applicants = await prisma.jobApplication.findMany({
    where,
    include: { jobListing: true },
    orderBy: { createdAt: 'desc' },
  });

  return json({ applicants: applicants.map(serialize) });
}

module.exports = { GET };
