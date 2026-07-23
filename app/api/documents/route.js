const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { DOCUMENTS_VIEW, DOCUMENTS_UPLOAD } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

/** Mirrors the demo's original download-permission rules, applied server
 * side (not just hidden in the UI):
 *  - a signed personal document is always view-only (scanned countersigned copy)
 *  - ID category documents are never downloadable (privacy)
 *  - company-wide CONTRACT docs (e.g. client MSAs) are downloadable only by Director/HR
 *  - company-wide COMPLIANCE docs (Phase 3 Compliance Store — regulatory/
 *    audit sign-off material) get the same access control as CONTRACT:
 *    downloadable only by Director/HR, viewable by everyone else in
 *    DOCUMENTS_VIEW
 *  - everything else (SOP/POLICY/CERTIFICATE/OTHER, unsigned) is downloadable by any viewer
 */
function canDownload(doc, session) {
  if (doc.signed) return false;
  if (doc.category === 'ID') return false;
  if ((doc.category === 'CONTRACT' || doc.category === 'COMPLIANCE') && !doc.employeeId) {
    return session.role === 'DIRECTOR' || session.role === 'HR_OFFICER';
  }
  return true;
}

function serialize(doc, session) {
  return {
    id: doc.id,
    employeeId: doc.employeeId,
    ownerName: doc.employee ? doc.employee.name : null,
    category: doc.category,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    signed: doc.signed,
    expiresAt: doc.expiresAt,
    notes: doc.notes,
    createdAt: doc.createdAt,
    mine: !!(session.employeeId && doc.employeeId === session.employeeId),
    canDownload: canDownload(doc, session),
    // SOP Library versioning (Phase 2) — real on every document, most
    // visible on company-wide category=SOP rows where a Director/HR upload
    // of a new version (see POST /api/documents/:id/version) increments this.
    version: doc.version,
    supersedesId: doc.supersedesId,
  };
}

async function GET(request) {
  const { session, errorResponse } = requireRole(request, DOCUMENTS_VIEW);
  if (errorResponse) return errorResponse;

  const docs = await prisma.document.findMany({
    include: { employee: true },
    orderBy: { createdAt: 'desc' },
  });

  // Per the brief: a user's own signed documents surface first.
  const sorted = [...docs].sort((a, b) => {
    const aMine = session.employeeId && a.employeeId === session.employeeId ? 1 : 0;
    const bMine = session.employeeId && b.employeeId === session.employeeId ? 1 : 0;
    if (aMine !== bMine) return bMine - aMine;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return json({ documents: sorted.map((d) => serialize(d, session)) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, DOCUMENTS_UPLOAD);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const category = body.category || 'OTHER';
  const fileName = body.fileName || `${category.toLowerCase()}-${Date.now()}.txt`;
  // Real file storage (e.g. Vercel Blob) is out of scope for Phase 1 — we
  // store a small placeholder text payload as a data URL, same idea as the
  // brief's suggested placeholder.
  const placeholderText = body.notes || `Placeholder content for ${fileName}, uploaded by ${session.email}.`;
  const fileDataUrl = `data:text/plain;base64,${Buffer.from(placeholderText).toString('base64')}`;

  const doc = await prisma.document.create({
    data: {
      employeeId: body.employeeId || null,
      category,
      fileName,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(placeholderText),
      fileDataUrl,
      signed: !!body.signed,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      notes: body.notes || null,
      uploadedByUserId: session.uid,
    },
    include: { employee: true },
  });

  await logAudit({ session, action: 'DOCUMENT_UPLOADED', targetType: 'Document', targetId: doc.id, detail: { fileName, category } });

  return json({ document: serialize(doc, session) }, { status: 201 });
}

module.exports = { GET, POST };
