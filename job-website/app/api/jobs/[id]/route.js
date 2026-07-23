const { prisma } = require('../../../../lib/db');
const { serializeListing } = require('../../../../lib/jobs');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });
  return json({ job: serializeListing(listing) });
}

module.exports = { GET };
