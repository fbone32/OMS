const { prisma } = require('../../../../lib/db');
const { requireAdmin } = require('../../../../lib/auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(e) {
  return {
    id: e.id,
    companyName: e.companyName,
    contactName: e.contactName,
    contactEmail: e.contactEmail,
    contactPhone: e.contactPhone,
    loginEmail: e.loginEmail,
    planTier: e.planTier,
    status: e.status,
    approvedByEmail: e.approvedBy ? e.approvedBy.email : null,
    approvedAt: e.approvedAt,
    rejectedReason: e.rejectedReason,
    jobListingCount: e._count.jobListings,
    createdAt: e.createdAt,
  };
}

// HR view of employer registrations - filterable by status.
async function GET(request) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || '').trim();
  const where = {};
  if (status) where.status = status;

  const employers = await prisma.employer.findMany({
    where,
    include: { approvedBy: true, _count: { select: { jobListings: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return json({ employers: employers.map(serialize) });
}

module.exports = { GET };
