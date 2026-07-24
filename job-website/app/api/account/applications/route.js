const { prisma } = require('../../../../lib/db');
const { requireCandidate } = require('../../../../lib/candidate-auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(a) {
  return {
    id: a.id,
    jobTitle: a.jobListing.title,
    branch: a.jobListing.branch,
    postingCompany: a.jobListing.employer ? a.jobListing.employer.companyName : a.jobListing.postingCompany,
    status: a.status,
    createdAt: a.createdAt,
  };
}

// Scoped to `candidateAccountId: session.cid` - the ONLY filter here, never
// a client-supplied id - so a candidate can only ever see applications they
// themselves submitted while signed in. Guest/anonymous applications (no
// candidateAccountId) never show up for anyone through this route.
async function GET(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  const applications = await prisma.jobApplication.findMany({
    where: { candidateAccountId: session.cid },
    include: { jobListing: { include: { employer: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return json({ applications: applications.map(serialize) });
}

module.exports = { GET };
