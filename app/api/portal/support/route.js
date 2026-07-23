// Client Portal support requests (brief: "Support-requests panel inside
// Client Portal") — a real, minimal ticket-style model (see
// ClientSupportRequest/ClientSupportMessage in schema.prisma), replacing
// what was previously a client-side-only mock thread. Same clientId
// isolation rule as every other portal route.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { SUPPORT_VIEW, SUPPORT_REPLY } = require('../../../../lib/roles');

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

function serialize(r) {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    createdAt: r.createdAt,
    messages: (r.messages || [])
      .slice()
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((m) => ({ id: m.id, body: m.body, fromClient: m.fromClient, authorEmail: m.author ? m.author.email : null, createdAt: m.createdAt })),
  };
}

async function GET(request) {
  const { session, errorResponse } = requireRole(request, SUPPORT_VIEW);
  if (errorResponse) return errorResponse;

  const clientId = await resolveClientId(request, session);
  if (!clientId) return json({ requests: [] });
  if (session.role === 'CLIENT' && clientId !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const requests = await prisma.clientSupportRequest.findMany({
    where: { clientId },
    include: { messages: { include: { author: true } } },
    orderBy: [{ createdAt: 'desc' }],
  });
  return json({ requests: requests.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, SUPPORT_REPLY);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const title = (body.title || '').trim();
  if (!title) return json({ error: 'title is required' }, { status: 400 });

  const clientId = await resolveClientId(request, session);
  if (!clientId) return json({ error: 'clientId is required' }, { status: 400 });
  if (session.role === 'CLIENT' && clientId !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const created = await prisma.clientSupportRequest.create({
    data: {
      clientId,
      title,
      createdByUserId: session.uid,
      messages: {
        create: [{ authorUserId: session.uid, fromClient: session.role === 'CLIENT', body: title }],
      },
    },
    include: { messages: { include: { author: true } } },
  });

  await logAudit({ session, action: 'SUPPORT_REQUEST_CREATED', targetType: 'ClientSupportRequest', targetId: created.id, detail: { clientId, title } });

  return json({ request: serialize(created) }, { status: 201 });
}

module.exports = { GET, POST };
