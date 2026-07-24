const { prisma } = require('../../../../lib/db');
const { requireCandidate, sessionCookieHeader } = require('../../../../lib/candidate-auth');

// Ghana Data Protection Act (Act 843) "right to erasure" self-service
// deletion. Deleting the CandidateAccount row is enough on its own: SavedJob
// rows cascade-delete (onDelete: Cascade, schema.prisma) since a saved job
// has no meaning to anyone but the candidate who saved it, while
// JobApplication.candidateAccountId is only SET NULL (onDelete: SetNull) -
// the submitted application stays intact as the employer's own recruitment
// record (same reasoning as the schema comment on that field), just no
// longer linked back to this account. Scoped to session.cid only.
async function POST(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  try {
    await prisma.candidateAccount.delete({ where: { id: session.cid } });
  } catch (err) {
    console.error('[account delete] failed to delete candidate account', err);
    return new Response(JSON.stringify({ error: 'Something went wrong deleting your account. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': sessionCookieHeader('', { clear: true }),
    },
  });
}

module.exports = { POST };
