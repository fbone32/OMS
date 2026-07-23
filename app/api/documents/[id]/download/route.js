const { prisma } = require('../../../../../lib/db');
const { requireRole, forbidden } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { DOCUMENTS_VIEW } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function canDownload(doc, session) {
  if (doc.signed) return false;
  if (doc.category === 'ID') return false;
  if (doc.category === 'CONTRACT' && !doc.employeeId) {
    return session.role === 'DIRECTOR' || session.role === 'HR_OFFICER';
  }
  return true;
}

// Server-side permission check on the actual download action, not just a
// hidden button in the UI — this is enforced even if a client forges a
// request directly.
async function GET(request, { params }) {
  const { session, errorResponse } = requireRole(request, DOCUMENTS_VIEW);
  if (errorResponse) return errorResponse;

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) return json({ error: 'Not found' }, { status: 404 });

  if (!canDownload(doc, session)) return forbidden('You are not permitted to download this document');

  await logAudit({ session, action: 'DOCUMENT_DOWNLOADED', targetType: 'Document', targetId: doc.id });

  return json({ fileName: doc.fileName, mimeType: doc.mimeType, fileDataUrl: doc.fileDataUrl });
}

module.exports = { GET };
