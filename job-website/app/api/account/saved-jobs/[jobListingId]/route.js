const { prisma } = require('../../../../../lib/db');
const { requireCandidate } = require('../../../../../lib/candidate-auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Unsave. `deleteMany` (not `delete`) with BOTH candidateAccountId and
// jobListingId in the where clause - so a candidate can never unsave (or
// probe the existence of) another candidate's saved-job row by guessing a
// jobListingId; a mismatched candidateAccountId simply matches zero rows.
async function DELETE(request, { params }) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  await prisma.savedJob.deleteMany({
    where: { candidateAccountId: session.cid, jobListingId: params.jobListingId },
  });

  return json({ ok: true, saved: false });
}

module.exports = { DELETE };
