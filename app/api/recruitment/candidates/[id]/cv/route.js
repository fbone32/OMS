const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { RECRUITMENT_VIEW } = require('../../../../../../lib/roles');

// Serves the actual CV bytes (decoded from the stored base64 data URL)
// directly, not wrapped in JSON - same pattern as the job-website's own
// admin CV route, so it opens/downloads as a real file in a new tab
// instead of the "fetch the JSON, do nothing with it" no-op the
// Recruitment screen's "View CV" button had before this route existed.
async function GET(request, { params }) {
  const { session, errorResponse } = requireRole(request, RECRUITMENT_VIEW);
  if (errorResponse) return errorResponse;

  const candidate = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!candidate) return new Response('Not found', { status: 404 });
  if (!candidate.cvDataUrl) return new Response('No CV on file for this candidate', { status: 404 });

  const match = candidate.cvDataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return new Response('Corrupt CV data', { status: 500 });
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, 'base64');

  await logAudit({ session, action: 'CANDIDATE_CV_DOWNLOADED', targetType: 'Candidate', targetId: candidate.id });

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': candidate.cvMimeType || mime,
      'Content-Disposition': `inline; filename="${(candidate.cvFileName || 'cv').replace(/"/g, '')}"`,
      'Content-Length': String(bytes.length),
    },
  });
}

module.exports = { GET };
