// SOP Library (Phase 2, scoped down) — no dedicated "SOP Library" screen
// exists in the template (isCalendar turned out to be a shift/leave
// calendar, not an SOP screen, and there's no Client/Sales concept live yet
// to scope "per client operation" against — see brief). This real versioning
// endpoint lives on top of the existing company-wide Document model
// (category=SOP, employeeId=null), reachable only via curl today since the
// Document Library screen's markup has no "upload new version" control.
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { DOCUMENTS_UPLOAD } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, DOCUMENTS_UPLOAD);
  if (errorResponse) return errorResponse;

  const previous = await prisma.document.findUnique({ where: { id: params.id } });
  if (!previous) return json({ error: 'Not found' }, { status: 404 });
  if (previous.category !== 'SOP') {
    return json({ error: 'Versioning is only supported for SOP-category documents' }, { status: 400 });
  }
  // supersedesId is @unique — each document can only ever be superseded once
  // (a straight-line version chain, not a branching tree). Check first and
  // return a clean 409 rather than letting the DB's unique-constraint error
  // surface as a 500.
  const alreadySuperseded = await prisma.document.findFirst({ where: { supersedesId: previous.id } });
  if (alreadySuperseded) {
    return json({ error: `This is not the latest version — v${alreadySuperseded.version} already supersedes it. Version from that document instead.`, latestId: alreadySuperseded.id }, { status: 409 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const fileName = body.fileName || previous.fileName;
  const notes = body.notes || previous.notes || '';
  const placeholderText = notes || `Placeholder content for ${fileName}, uploaded by ${session.email}.`;
  const fileDataUrl = `data:text/plain;base64,${Buffer.from(placeholderText).toString('base64')}`;

  const newVersion = await prisma.document.create({
    data: {
      employeeId: null,
      category: 'SOP',
      fileName,
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(placeholderText),
      fileDataUrl,
      signed: false,
      notes,
      uploadedByUserId: session.uid,
      version: previous.version + 1,
      supersedesId: previous.id,
    },
  });

  await logAudit({
    session,
    action: 'SOP_VERSION_CREATED',
    targetType: 'Document',
    targetId: newVersion.id,
    detail: { fileName, previousVersion: previous.version, newVersion: newVersion.version, supersedesId: previous.id },
  });

  return json({ document: { id: newVersion.id, fileName: newVersion.fileName, version: newVersion.version, supersedesId: newVersion.supersedesId } }, { status: 201 });
}

module.exports = { POST };
