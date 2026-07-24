const { prisma } = require('../../../../lib/db');
const { serializeListing, publiclyVisibleWhere } = require('../../../../lib/jobs');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  // Live filter (not cached) - see lib/jobs.js publiclyVisibleWhere.
  const listing = await prisma.jobListing.findFirst({ where: publiclyVisibleWhere({ id: params.id }) });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });
  return json({ job: serializeListing(listing) });
}

module.exports = { GET };
