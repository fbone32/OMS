const { prisma } = require('../../../../../lib/db');

// Authenticated ONLY via the shared JOB_WEBSITE_API_SECRET header — this is
// the OMS calling back to fetch the raw CV bytes after it received the
// application metadata push (see lib/oms-sync.js's comment on why the CV
// bytes travel as a raw binary response here rather than embedded as base64
// in the original JSON push: keeps every single request, in both
// directions, comfortably under Vercel's ~4.5MB function payload ceiling).
async function GET(request, { params }) {
  const secret = request.headers.get('x-job-website-secret');
  if (!secret || secret !== process.env.JOB_WEBSITE_API_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

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
      'Content-Disposition': `attachment; filename="${app.cvFileName.replace(/"/g, '')}"`,
      'Content-Length': String(bytes.length),
      'x-cv-file-name': encodeURIComponent(app.cvFileName),
    },
  });
}

module.exports = { GET };
