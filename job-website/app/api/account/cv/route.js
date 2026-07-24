const { prisma } = require('../../../../lib/db');
const { requireCandidate } = require('../../../../lib/candidate-auth');
const { validateCvFile } = require('../../../../lib/validation');

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

// Replaces the signed-in candidate's "CV on file" - the same base64
// data-url storage shape JobApplication already uses (see lib/db.js /
// prisma/schema.prisma comments), just living on CandidateAccount so it can
// be reused across applications without re-uploading each time.
async function POST(request) {
  const { session, errorResponse } = requireCandidate(request);
  if (errorResponse) return errorResponse;

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Could not read submitted form data.' }, { status: 400 });
  }

  const cvFile = form.get('cv');
  if (!cvFile || typeof cvFile === 'string') {
    return json({ error: 'Please attach a CV file.' }, { status: 400 });
  }
  const cvCheck = validateCvFile({ name: cvFile.name, type: cvFile.type, size: cvFile.size });
  if (!cvCheck.ok) return json({ error: cvCheck.error }, { status: 400 });

  const cvDataUrl = await fileToDataUrl(cvFile);
  const candidate = await prisma.candidateAccount.update({
    where: { id: session.cid },
    data: {
      cvFileName: cvFile.name || 'cv',
      cvMimeType: cvFile.type || 'application/octet-stream',
      cvSizeBytes: cvFile.size,
      cvDataUrl,
    },
  });

  return json({ ok: true, cvFileName: candidate.cvFileName, cvSizeBytes: candidate.cvSizeBytes });
}

module.exports = { POST };
