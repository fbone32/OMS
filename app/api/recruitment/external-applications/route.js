const crypto = require('crypto');
const { prisma } = require('../../../../lib/db');
const { logAudit } = require('../../../../lib/audit');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Cross-app integration endpoint: the job-website (jobs.openbaseafrica.com,
// a fully separate Next.js app/Vercel project/database-schema — see its
// prisma/schema.prisma header) pushes each guest application here so it
// becomes a REAL Candidate row in this OMS's existing Recruitment pipeline
// (Phase 2), tied to a real JobOpening.
//
// *** REQUIRED NEW ENV VAR: JOB_WEBSITE_API_SECRET ***
// Same category as SESSION_SECRET/VAULT_ENCRYPTION_KEY/RESEND_API_KEY — must
// be set on BOTH this project's Vercel env vars AND the job-website
// project's Vercel env vars, with the EXACT SAME value. There is no session
// cookie here (the caller is a server, not a logged-in browser), so this
// shared secret, sent as the `x-job-website-secret` header, is the entire
// authentication for this route. Missing/mismatched secret -> 401, always,
// even in development (never falls back to an open/unauthenticated mode).
//
// Retry-safe / idempotent by design: the job-website may call this more
// than once for the same application (its own retry queue). Duplicate
// pushes are detected two ways —
//   1. same externalJobRef -> same JobOpening (find-or-create, never a
//      second JobOpening for the same public listing).
//   2. same (email, jobOpeningId) -> the existing Candidate row is returned
//      as `duplicate: true` instead of creating a second one (backed by a
//      real DB unique constraint, @@unique([email, jobOpeningId]) on
//      Candidate, so a race between two retries can't double-create either).
//
// CV bytes are deliberately NOT sent in this request's body — only a
// `cvCallbackUrl` is, which this route calls back synchronously to pull the
// raw file bytes as their own dedicated response (not wrapped in JSON/
// base64), keeping every individual request across this integration well
// under Vercel's ~4.5MB function payload ceiling regardless of CV size (see
// the job-website's lib/oms-sync.js for the full rationale). If that pull
// fails, the Candidate row is still created (applicant data is the
// important real-time part) — just without a CV attached yet — and the
// failure is logged; it is not retried automatically in Phase 1.
async function POST(request) {
  const secret = request.headers.get('x-job-website-secret');
  const expected = process.env.JOB_WEBSITE_API_SECRET;
  if (!expected) {
    console.error('[external-applications] JOB_WEBSITE_API_SECRET is not configured on this OMS deployment');
    return json({ error: 'This endpoint is not configured on this deployment.' }, { status: 500 });
  }
  if (!secret || !timingSafeStringEqual(secret, expected)) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const externalJobRef = (body.externalJobRef || '').trim();
  const jobTitle = (body.jobTitle || '').trim();
  const branch = (body.branch || '').trim();
  const applicant = body.applicant || {};
  const name = (applicant.name || '').trim();
  const email = (applicant.email || '').trim().toLowerCase();
  const phone = (applicant.phone || '').trim();
  const coverLetter = (body.coverLetter || '').trim();

  const missing = [];
  if (!externalJobRef) missing.push('externalJobRef');
  if (!jobTitle) missing.push('jobTitle');
  if (!branch) missing.push('branch');
  if (!name) missing.push('applicant.name');
  if (!email) missing.push('applicant.email');
  if (missing.length) return json({ error: `Missing field(s): ${missing.join(', ')}` }, { status: 400 });

  // Find-or-create the JobOpening this listing maps to.
  let jobOpening = await prisma.jobOpening.findUnique({ where: { externalRef: externalJobRef } });
  if (!jobOpening) {
    jobOpening = await prisma.jobOpening.create({
      data: {
        title: jobTitle,
        branch,
        status: 'OPEN',
        externalRef: externalJobRef,
        externalSource: 'JOB_WEBSITE',
      },
    });
    await logAudit({
      session: null,
      action: 'JOB_OPENING_CREATED_FROM_JOB_WEBSITE',
      targetType: 'JobOpening',
      targetId: jobOpening.id,
      detail: { title: jobTitle, branch, externalJobRef },
    });
  }

  // Idempotency: same (email, jobOpeningId) already exists -> return it
  // rather than creating a duplicate (real DB unique constraint backs this
  // even under a race from two retries firing close together).
  const existingCandidate = await prisma.candidate.findUnique({
    where: { email_jobOpeningId: { email, jobOpeningId: jobOpening.id } },
  });
  if (existingCandidate) {
    return json({ candidateId: existingCandidate.id, jobOpeningId: jobOpening.id, duplicate: true }, { status: 200 });
  }

  let candidate;
  try {
    candidate = await prisma.candidate.create({
      data: {
        name,
        email,
        phone: phone || null,
        jobOpeningId: jobOpening.id,
        roleTitle: `${jobTitle} · ${branch}`,
        source: 'JOB_WEBSITE',
        coverLetter: coverLetter || null,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      // Lost a race to a concurrent retry — fetch and return the winner.
      const winner = await prisma.candidate.findUnique({
        where: { email_jobOpeningId: { email, jobOpeningId: jobOpening.id } },
      });
      if (winner) return json({ candidateId: winner.id, jobOpeningId: jobOpening.id, duplicate: true }, { status: 200 });
    }
    console.error('[external-applications] failed to create candidate', err);
    return json({ error: 'Failed to create candidate record' }, { status: 500 });
  }

  await logAudit({
    session: null,
    action: 'CANDIDATE_ADDED_FROM_JOB_WEBSITE',
    targetType: 'Candidate',
    targetId: candidate.id,
    detail: { name, email, roleTitle: candidate.roleTitle, jobOpeningId: jobOpening.id },
  });

  // Pull the CV bytes back from the job-website, as their own dedicated
  // request — best-effort, never fails the Candidate creation above.
  if (body.cvCallbackUrl) {
    try {
      const cvRes = await fetch(body.cvCallbackUrl, {
        headers: { 'x-job-website-secret': expected },
        signal: AbortSignal.timeout(8000),
      });
      if (cvRes.ok) {
        const buf = Buffer.from(await cvRes.arrayBuffer());
        const mime = cvRes.headers.get('content-type') || body.cvMimeType || 'application/octet-stream';
        const cvDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: {
            cvFileName: body.cvFileName || 'cv',
            cvMimeType: mime,
            cvSizeBytes: buf.length,
            cvDataUrl,
          },
        });
      } else {
        console.error(`[external-applications] CV callback returned ${cvRes.status} for candidate ${candidate.id}`);
      }
    } catch (err) {
      console.error(`[external-applications] failed to pull CV for candidate ${candidate.id}:`, err.message || err);
    }
  }

  return json({ candidateId: candidate.id, jobOpeningId: jobOpening.id, duplicate: false }, { status: 201 });
}

module.exports = { POST };
