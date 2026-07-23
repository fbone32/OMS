const { prisma } = require('../../../../lib/db');
const { requireAdmin } = require('../../../../lib/auth');
const { retryPendingSyncs } = require('../../../../lib/oms-sync');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(a) {
  return {
    id: a.id,
    jobListingId: a.jobListingId,
    jobTitle: a.jobListing.title,
    branch: a.jobListing.branch,
    fullName: a.fullName,
    phone: a.phone,
    email: a.email,
    whyGoodFit: a.whyGoodFit,
    cvFileName: a.cvFileName,
    cvMimeType: a.cvMimeType,
    cvSizeBytes: a.cvSizeBytes,
    status: a.status,
    syncStatus: a.syncStatus,
    lastSyncError: a.lastSyncError,
    omsCandidateId: a.omsCandidateId,
    confirmationEmailSent: a.confirmationEmailSent,
    createdAt: a.createdAt,
  };
}

// Applicants list — filter by status + search by name/email. Also
// opportunistically retries any PENDING OMS-sync rows on every load (see
// lib/oms-sync.js's comment on the retry-safe queue) so the admin dashboard
// is a natural "next request" retry trigger even with no cron configured.
async function GET(request) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  // Best-effort, bounded, never blocks the list from rendering if it's slow.
  try {
    await retryPendingSyncs(10, request);
  } catch (err) {
    console.error('[applicants] opportunistic retry failed', err);
  }

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get('status') || '').trim();
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const jobListingId = (searchParams.get('jobListingId') || '').trim();

  const where = {};
  if (status) where.status = status;
  if (jobListingId) where.jobListingId = jobListingId;

  let applicants = await prisma.jobApplication.findMany({
    where,
    include: { jobListing: true },
    orderBy: { createdAt: 'desc' },
  });

  if (q) {
    applicants = applicants.filter(
      (a) => a.fullName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
    );
  }

  return json({ applicants: applicants.map(serialize) });
}

module.exports = { GET };
