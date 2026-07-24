const { prisma } = require('../../../lib/db');
const { serializeListing, effectiveStatus, publiclyVisibleWhere } = require('../../../lib/jobs');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Public listings — search + filters (location/branch, shift). Only
// effectively-OPEN listings are ever returned here (closed/expired never
// show up in public search, matching the brief's empty-state requirement).
async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const branch = (searchParams.get('branch') || '').trim();
  const shift = (searchParams.get('shift') || '').trim();

  const where = publiclyVisibleWhere({ status: 'OPEN' });
  if (branch) where.branch = branch;
  if (shift) where.shift = shift;

  const listings = await prisma.jobListing.findMany({ where, orderBy: { createdAt: 'desc' } });

  const filtered = listings
    .filter((l) => effectiveStatus(l) === 'OPEN')
    .filter((l) => !q || l.title.toLowerCase().includes(q) || l.branch.toLowerCase().includes(q));

  return json({ jobs: filtered.map(serializeListing) });
}

module.exports = { GET };
