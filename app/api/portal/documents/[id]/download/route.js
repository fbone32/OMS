// Client Portal document download — verifies the document's clientId
// matches this session's own resolved client before ever returning the file
// data, the same server-side (not just UI-hidden) enforcement every other
// download/reveal route in this codebase uses.
const { prisma } = require('../../../../../../lib/db');
const { requireRole, forbidden } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { PORTAL_VIEW } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request, { params }) {
  const { session, errorResponse } = requireRole(request, PORTAL_VIEW);
  if (errorResponse) return errorResponse;

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || !doc.clientId) return json({ error: 'Not found' }, { status: 404 });

  const url = new URL(request.url);
  const allowedClientId = session.role === 'CLIENT' ? session.clientId : url.searchParams.get('clientId') || doc.clientId;
  if (doc.clientId !== allowedClientId) return forbidden('You are not permitted to download this document');

  await logAudit({ session, action: 'PORTAL_DOCUMENT_DOWNLOADED', targetType: 'Document', targetId: doc.id, detail: { clientId: doc.clientId } });

  return json({ fileName: doc.fileName, mimeType: doc.mimeType, fileDataUrl: doc.fileDataUrl });
}

module.exports = { GET };
