// Contact log (call/email/meeting notes) against a deal — the brief's
// requirement that "each deal has a contact log".
const { prisma } = require('../../../../../../lib/db');
const { requireRole } = require('../../../../../../lib/auth');
const { logAudit } = require('../../../../../../lib/audit');
const { SALES_MANAGE } = require('../../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, SALES_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const type = (body.type || '').toUpperCase();
  const note = (body.note || '').trim();
  if (!['CALL', 'EMAIL', 'MEETING'].includes(type)) {
    return json({ error: "type must be 'CALL', 'EMAIL' or 'MEETING'" }, { status: 400 });
  }
  if (!note) return json({ error: 'note is required' }, { status: 400 });

  const deal = await prisma.deal.findUnique({ where: { id: params.id } });
  if (!deal) return json({ error: 'Not found' }, { status: 404 });

  const log = await prisma.dealContactLog.create({
    data: { dealId: deal.id, type, note, createdByUserId: session.uid },
    include: { createdBy: true },
  });

  await logAudit({ session, action: 'DEAL_CONTACT_LOGGED', targetType: 'Deal', targetId: deal.id, detail: { type, company: deal.company } });

  return json(
    {
      log: {
        id: log.id,
        type: log.type,
        note: log.note,
        createdByEmail: log.createdBy.email,
        createdAt: log.createdAt,
      },
    },
    { status: 201 }
  );
}

module.exports = { POST };
