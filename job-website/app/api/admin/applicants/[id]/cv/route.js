const { prisma } = require('../../../../../../lib/db');
const { requireAdmin } = require('../../../../../../lib/auth');

// Serves the actual CV bytes (decoded from the stored base64 data URL) so
// the admin panel can preview/download a real file, not a stub.
async function GET(request, { params }) {
  const { errorResponse } = requireAdmin(request);
  if (errorResponse) return errorResponse;

  const app = await prisma.jobApplication.findUnique({ where: { id: params.id } });
  if (!app) return new Response('Not found', { status: 404 });

  const match = app.cvDataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (!match) return new Response('Corrupt CV data', { status: 500 });
  const [, mime, b64] = match;
  const bytes = Buffer.from(b64, 'base64');

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Disposition': `inline; filename="${app.cvFileName.replace(/"/g, '')}"`,
      'Content-Length': String(bytes.length),
    },
  });
}

module.exports = { GET };
