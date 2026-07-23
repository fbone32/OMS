// Reply to a Client Portal support request — either side (the CLIENT who
// raised it, or Director/Business Development on the OBA side) can add a
// message to the thread. clientId ownership is re-verified here too, not
// just at the parent list route, so a CLIENT session can never reply into a
// different client's thread even by guessing/forging a request id.
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { SUPPORT_REPLY } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, SUPPORT_REPLY);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const text = (body.body || '').trim();
  if (!text) return json({ error: 'body is required' }, { status: 400 });

  const supportRequest = await prisma.clientSupportRequest.findUnique({ where: { id: params.id } });
  if (!supportRequest) return json({ error: 'Not found' }, { status: 404 });
  if (session.role === 'CLIENT' && supportRequest.clientId !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const fromClient = session.role === 'CLIENT';
  const [message] = await prisma.$transaction([
    prisma.clientSupportMessage.create({
      data: { requestId: supportRequest.id, authorUserId: session.uid, fromClient, body: text },
      include: { author: true },
    }),
    prisma.clientSupportRequest.update({
      where: { id: supportRequest.id },
      data: { status: fromClient ? supportRequest.status : 'IN_PROGRESS' },
    }),
  ]);

  await logAudit({ session, action: 'SUPPORT_REQUEST_REPLIED', targetType: 'ClientSupportRequest', targetId: supportRequest.id, detail: { fromClient } });

  return json({
    message: { id: message.id, body: message.body, fromClient: message.fromClient, authorEmail: message.author.email, createdAt: message.createdAt },
  }, { status: 201 });
}

module.exports = { POST };
