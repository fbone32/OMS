const { prisma } = require('../../../../../../lib/db');
const { requireEmployer } = require('../../../../../../lib/employer-auth');

// Serves CV bytes for ONE applicant, scoped to a listing owned by the
// logged-in employer. The `jobListing: { employerId: session.eid }` filter
// is the only thing standing between this route and a cross-tenant CV leak
// - it must stay on every query here, never relaxed to id-only.
async function GET(request, { params }) {
  const { session, errorResponse } = requireEmployer(request);
  if (errorResponse) return errorResponse;

  const app = await prisma.jobApplication.findFirst({
    where: { id: params.id, jobListing: { employerId: session.eid } },
  });
  if (!app) return new Response('Not found', { status: 404 });

  const match = app.cvDataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return new Response('Corrupt CV data', { status: 500 });
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, 'base64');

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${app.cvFileName.replace(/"/g, '')}"`,
      'Content-Length': String(bytes.length),
    },
  });
}

module.exports = { GET };
