const { prisma } = require('../../../../lib/db');
const { requireCandidate } = require('../../../../lib/candidate-auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(s) {
  return {
    id: s.id,
    jobListingId: s.jobListingId,
    jobTitle: s.jobListing.title,
    branch: s.jobListing.branch,
    status: s.jobListing.status,
    closingDate: s.jobListing.closingDate,
    savedAt: s.createdAt,
  };
}

// Scoped to `candidateAccountId: session.cid` throughout - a candidate can
// only ever list, create, or (via the [jobListingId] route) remove their
// OWN saved jobs.
async function GET(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  const savedJobs = await prisma.savedJob.findMany({
    where: { candidateAccountId: session.cid },
    include: { jobListing: true },
    orderBy: { createdAt: 'desc' },
  });

  return json({ savedJobs: savedJobs.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const jobListingId = (body.jobListingId || '').trim();
  if (!jobListingId) return json({ error: 'jobListingId is required.' }, { status: 400 });

  const listing = await prisma.jobListing.findUnique({ where: { id: jobListingId } });
  if (!listing) return json({ error: 'Job not found.' }, { status: 404 });

  // Idempotent: saving an already-saved job is a no-op success, not an error.
  await prisma.savedJob.upsert({
    where: { candidateAccountId_jobListingId: { candidateAccountId: session.cid, jobListingId } },
    update: {},
    create: { candidateAccountId: session.cid, jobListingId },
  });

  return json({ ok: true, saved: true }, { status: 201 });
}

module.exports = { GET, POST };
