const { prisma } = require('../../../../../lib/db');
const { isAcceptingApplications } = require('../../../../../lib/jobs');
const { validateCvFile, validateApplication } = require('../../../../../lib/validation');
const { checkRateLimit, clientIp, pruneOldHits } = require('../../../../../lib/rate-limit');
const { sendEmail, applicationConfirmationEmail } = require('../../../../../lib/email');
const { pushApplication } = require('../../../../../lib/oms-sync');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function fileToDataUrl(file) {
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// Real application submission — genuine multipart parsing (Next.js Route
// Handler reading the Web-standard FormData/File API), not a simulated
// upload. Spam/abuse protection: DB-backed rate limit by IP + a honeypot
// field (bots that fill hidden fields are silently accepted-and-dropped, no
// error, so scripts get no signal that they were caught).
async function POST(request, { params }) {
  const ip = clientIp(request);
  const allowed = await checkRateLimit(`apply:${ip}`, { limit: 6, windowMs: 60_000 });
  if (!allowed) {
    return json({ error: 'Too many requests — please wait a minute and try again.' }, { status: 429 });
  }
  pruneOldHits(); // fire-and-forget, best-effort

  const listing = await prisma.jobListing.findUnique({ where: { id: params.id } });
  if (!listing) return json({ error: 'Job not found' }, { status: 404 });
  if (!isAcceptingApplications(listing)) {
    return json({ error: 'This role is no longer accepting applications.' }, { status: 400 });
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Could not read submitted form data.' }, { status: 400 });
  }

  // Honeypot — a hidden field real candidates never see or fill. If it has
  // any value, silently pretend success without doing any real work.
  const honeypot = (form.get('company_website') || '').toString();
  if (honeypot) {
    return json({ ok: true, applicationId: 'noop' }, { status: 201 });
  }

  const fullName = (form.get('fullName') || '').toString().trim();
  const phone = (form.get('phone') || '').toString().trim();
  const email = (form.get('email') || '').toString().trim().toLowerCase();
  const whyGoodFit = (form.get('whyGoodFit') || '').toString().trim();
  const cvFile = form.get('cv');

  const { ok: fieldsOk, errors } = validateApplication({ fullName, phone, email, whyGoodFit });
  if (!fieldsOk) return json({ error: 'Please fix the highlighted fields.', fieldErrors: errors }, { status: 400 });

  if (!cvFile || typeof cvFile === 'string') {
    return json({ error: 'Please attach your CV.', fieldErrors: { cv: 'CV file is required.' } }, { status: 400 });
  }
  const cvCheck = validateCvFile({ name: cvFile.name, type: cvFile.type, size: cvFile.size });
  if (!cvCheck.ok) {
    return json({ error: cvCheck.error, fieldErrors: { cv: cvCheck.error } }, { status: 400 });
  }

  // Duplicate-application guard: block a second application from the same
  // email to the same role. Checked here (fast, friendly error) AND
  // enforced at the DB level via a real unique constraint (@@unique
  // [jobListingId, email]) so a race between two near-simultaneous
  // submissions from the same email can't both slip through.
  const existing = await prisma.jobApplication.findUnique({
    where: { jobListingId_email: { jobListingId: listing.id, email } },
  });
  if (existing) {
    return json(
      { error: 'You have already applied for this role with this email address.' },
      { status: 409 }
    );
  }

  const cvDataUrl = await fileToDataUrl(cvFile);

  let application;
  try {
    application = await prisma.jobApplication.create({
      data: {
        jobListingId: listing.id,
        fullName,
        phone,
        email,
        whyGoodFit,
        cvFileName: cvFile.name || 'cv',
        cvMimeType: cvFile.type || 'application/octet-stream',
        cvSizeBytes: cvFile.size,
        cvDataUrl,
        ipAddress: ip,
      },
    });
  } catch (err) {
    if (err && err.code === 'P2002') {
      return json({ error: 'You have already applied for this role with this email address.' }, { status: 409 });
    }
    console.error('[apply] failed to create application', err);
    return json({ error: 'Something went wrong saving your application. Please try again.' }, { status: 500 });
  }

  // Confirmation email — best-effort, never blocks/fails the submission.
  const { subject, html, text } = applicationConfirmationEmail({
    fullName,
    jobTitle: listing.title,
    branch: listing.branch,
  });
  const emailResult = await sendEmail({ to: email, subject, html, text });
  await prisma.jobApplication.update({
    where: { id: application.id },
    data: { confirmationEmailSent: emailResult.ok, confirmationEmailError: emailResult.ok ? null : emailResult.error },
  });

  // Push into the OMS recruitment pipeline — fast synchronous attempt; on
  // failure the row stays PENDING and the retry queue (lib/oms-sync.js)
  // picks it up later. Either way the candidate's application is already
  // safely saved above, so this never turns into a failed submission from
  // the candidate's point of view.
  const syncResult = await pushApplication(application.id, request);

  return json(
    {
      ok: true,
      applicationId: application.id,
      emailSent: emailResult.ok,
      omsSynced: !!syncResult.ok,
    },
    { status: 201 }
  );
}

module.exports = { POST };
