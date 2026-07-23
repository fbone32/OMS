// Client Portal's own documents (brief: "Documents/Training/Support-requests
// panels inside Client Portal"). Real Document rows scoped to Document.
// clientId — same clientId isolation rule as every other portal route: a
// CLIENT session's clientId ALWAYS comes from the verified session cookie,
// never a query param.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { PORTAL_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function resolveClientId(request, session) {
  if (session.role === 'CLIENT') return session.clientId;
  const url = new URL(request.url);
  const requested = url.searchParams.get('clientId');
  if (requested) return requested;
  const first = await prisma.client.findFirst({ orderBy: { createdAt: 'asc' } });
  return first ? first.id : null;
}

async function GET(request) {
  const { session, errorResponse } = requireRole(request, PORTAL_VIEW);
  if (errorResponse) return errorResponse;

  const clientId = await resolveClientId(request, session);
  if (!clientId) return json({ documents: [] });
  if (session.role === 'CLIENT' && clientId !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const docs = await prisma.document.findMany({
    where: { clientId },
    orderBy: { createdAt: 'desc' },
  });
  return json({
    documents: docs.map((d) => ({
      id: d.id,
      fileName: d.fileName,
      category: d.category,
      signed: d.signed,
      createdAt: d.createdAt,
    })),
  });
}

module.exports = { GET };
