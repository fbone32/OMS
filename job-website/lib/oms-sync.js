// Pushes a submitted application into the OMS's real Recruitment pipeline
// (Candidate/JobOpening models) over HTTP, authenticated with a shared
// secret — NOT direct DB access (this app's Prisma client has no knowledge
// of the OMS's tables at all, by design; see prisma/schema.prisma header).
//
// *** REQUIRED NEW ENV VARS (this app's Vercel project) ***
//   JOB_WEBSITE_API_SECRET  — shared secret, must match the OMS project's
//                             own JOB_WEBSITE_API_SECRET exactly.
//   OMS_BASE_URL            — the OMS deployment's base URL, e.g.
//                             https://oms.vercel.app (no trailing slash).
//   PUBLIC_BASE_URL         — this app's OWN public base URL (e.g.
//                             https://oba-jobs.vercel.app), sent to the OMS
//                             as a callback URL so it can pull the CV bytes
//                             back (see /api/internal/cv/[id]). Falls back
//                             to VERCEL_URL at request time if unset.
//
// Retry-safe queue: every application is written to the DB with
// syncStatus=PENDING BEFORE any network call is attempted, so a candidate's
// application is never lost even if the OMS is completely unreachable — the
// push is attempted once synchronously (fast path, so the confirmation
// screen can say "you're in the pipeline" immediately when it works), and
// on failure just leaves the row PENDING for retryPendingSyncs() to pick up
// later. retryPendingSyncs() is invoked opportunistically from:
//   (a) a Vercel Cron hitting /api/internal/retry-sync every 10 minutes
//       (see vercel.json — falls back gracefully if the plan doesn't
//       support that frequency), and
//   (b) the admin applicants dashboard, on every page load (cheap, small
//       batch, self-healing even with no cron at all).
const { prisma } = require('./db');

function getBaseUrl(request) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3100';
}

async function attemptPush(application, jobListing, request) {
  const secret = process.env.JOB_WEBSITE_API_SECRET;
  const omsBaseUrl = process.env.OMS_BASE_URL;
  if (!secret || !omsBaseUrl) {
    return { ok: false, error: 'JOB_WEBSITE_API_SECRET or OMS_BASE_URL not configured' };
  }

  const cvCallbackUrl = `${getBaseUrl(request)}/api/internal/cv/${application.id}`;

  let res;
  try {
    res = await fetch(`${omsBaseUrl.replace(/\/$/, '')}/api/recruitment/external-applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-job-website-secret': secret },
      body: JSON.stringify({
        externalJobRef: jobListing.externalRef,
        jobTitle: jobListing.title,
        branch: jobListing.branch,
        applicant: {
          name: application.fullName,
          email: application.email,
          phone: application.phone,
        },
        coverLetter: application.whyGoodFit,
        applicationId: application.id,
        cvCallbackUrl,
        cvFileName: application.cvFileName,
        cvMimeType: application.cvMimeType,
        cvSizeBytes: application.cvSizeBytes,
      }),
      // Keep this fast — the fast-path push happens inline on the
      // candidate's own apply request; if the OMS is slow/down, fail
      // quickly and let the retry queue handle it instead of holding the
      // candidate's browser request open.
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    return { ok: false, error: `network error: ${err.message || err}` };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON error body — fall through with body=null
  }

  if (!res.ok) {
    return { ok: false, error: `OMS responded ${res.status}: ${(body && body.error) || 'unknown error'}` };
  }

  return { ok: true, candidateId: body && body.candidateId, jobOpeningId: body && body.jobOpeningId, duplicate: !!(body && body.duplicate) };
}

/** Attempts to push one application now; always updates the row's sync
 * bookkeeping fields regardless of outcome. Never throws. */
async function pushApplication(applicationId, request) {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    include: { jobListing: true },
  });
  if (!application) return { ok: false, error: 'application not found' };
  if (application.syncStatus === 'SYNCED') return { ok: true, alreadySynced: true };

  const result = await attemptPush(application, application.jobListing, request);

  await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      syncStatus: result.ok ? 'SYNCED' : 'PENDING',
      syncAttempts: { increment: 1 },
      lastSyncError: result.ok ? null : result.error,
      lastSyncAt: new Date(),
      omsCandidateId: result.ok ? result.candidateId || null : application.omsCandidateId,
      omsJobOpeningId: result.ok ? result.jobOpeningId || null : application.omsJobOpeningId,
    },
  });

  return result;
}

/** Retries every PENDING application, oldest first, up to `limit`. Used by
 * both the cron endpoint and the opportunistic admin-dashboard-load call. */
async function retryPendingSyncs(limit = 15, request) {
  const pending = await prisma.jobApplication.findMany({
    where: { syncStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
  const results = [];
  for (const app of pending) {
    // eslint-disable-next-line no-await-in-loop
    const result = await pushApplication(app.id, request);
    results.push({ id: app.id, ...result });
  }
  return results;
}

module.exports = { pushApplication, retryPendingSyncs };
