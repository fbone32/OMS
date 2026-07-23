const { prisma } = require('../../../../../lib/db');
const { requireAdmin } = require('../../../../../lib/auth');

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Real CSV export of applicants (optionally filtered), built directly from
// the DB — not a client-side table dump — so it reflects the exact same
// filtered set an admin is looking at.
async function GET(request) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || '').trim();
  const jobListingId = (searchParams.get('jobListingId') || '').trim();

  const where = {};
  if (status) where.status = status;
  if (jobListingId) where.jobListingId = jobListingId;

  const applicants = await prisma.jobApplication.findMany({
    where,
    include: { jobListing: true },
    orderBy: { createdAt: 'desc' },
  });

  const header = ['Name', 'Email', 'Phone', 'Role', 'Branch', 'Status', 'OMS Synced', 'Applied At'];
  const rows = applicants.map((a) => [
    a.fullName,
    a.email,
    a.phone,
    a.jobListing.title,
    a.jobListing.branch,
    a.status,
    a.syncStatus === 'SYNCED' ? 'Yes' : 'No',
    a.createdAt.toISOString(),
  ]);

  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="applicants-${Date.now()}.csv"`,
    },
  });
}

module.exports = { GET };
