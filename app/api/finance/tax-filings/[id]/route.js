const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { FINANCE_MANAGE } = require('../../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function PATCH(request, { params }) {
  const { session, errorResponse } = requireRole(request, FINANCE_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.filed !== true) {
    return json({ error: "Only { filed: true } is supported — a filing can't be un-filed here" }, { status: 400 });
  }

  const existing = await prisma.taxFiling.findUnique({ where: { id: params.id } });
  if (!existing) return json({ error: 'Not found' }, { status: 404 });
  if (existing.filed) return json({ error: 'Already marked filed' }, { status: 400 });

  const updated = await prisma.taxFiling.update({
    where: { id: existing.id },
    data: { filed: true, filedAt: new Date(), filedByUserId: session.uid },
  });

  await logAudit({
    session,
    action: 'TAX_FILING_MARKED_FILED',
    targetType: 'TaxFiling',
    targetId: updated.id,
    detail: { type: updated.type, period: updated.period },
  });

  return json({ filing: { id: updated.id, filed: updated.filed, filedAt: updated.filedAt } });
}

module.exports = { PATCH };
