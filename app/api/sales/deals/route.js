// Sales & CRM deal pipeline (Phase 4). Business Development owns it,
// Director has full access. Mirrors app/api/recruitment/candidates/route.js's
// shape (a job-opening-style parent with pipeline stage cards underneath).
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { SALES_VIEW, SALES_MANAGE } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(d) {
  return {
    id: d.id,
    company: d.company,
    contactName: d.contactName,
    contactEmail: d.contactEmail,
    contactPhone: d.contactPhone,
    region: d.region,
    serviceDesc: d.serviceDesc,
    valueAmount: d.valueAmount != null ? Number(d.valueAmount) : null,
    currency: d.currency,
    source: d.source,
    stage: d.stage,
    lostReason: d.lostReason,
    convertedClientId: d.convertedClientId,
    convertedAt: d.convertedAt,
    createdAt: d.createdAt,
    contactLogCount: d._count ? d._count.contactLogs : (d.contactLogs ? d.contactLogs.length : 0),
    contactLogs: d.contactLogs
      ? d.contactLogs.map((l) => ({
          id: l.id,
          type: l.type,
          note: l.note,
          createdByEmail: l.createdBy ? l.createdBy.email : null,
          createdAt: l.createdAt,
        }))
      : undefined,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, SALES_VIEW);
  if (errorResponse) return errorResponse;

  const deals = await prisma.deal.findMany({
    include: {
      _count: { select: { contactLogs: true } },
      // Full contact log rows too (not just the count) — the deal detail
      // modal reads these straight off the list response rather than a
      // second round-trip per deal.
      contactLogs: { include: { createdBy: true }, orderBy: { createdAt: 'desc' } },
    },
    orderBy: [{ createdAt: 'desc' }],
  });
  return json({ deals: deals.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, SALES_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const company = (body.company || '').trim();
  const serviceDesc = (body.serviceDesc || '').trim();
  if (!company || !serviceDesc) {
    return json({ error: 'company and serviceDesc are required' }, { status: 400 });
  }

  const deal = await prisma.deal.create({
    data: {
      company,
      serviceDesc,
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      region: body.region || 'Ghana',
      valueAmount: body.valueAmount != null && body.valueAmount !== '' ? body.valueAmount : null,
      currency: body.currency || '$',
      source: body.source || 'Website',
      createdByUserId: session.uid,
    },
    include: { _count: { select: { contactLogs: true } } },
  });

  await logAudit({ session, action: 'DEAL_CREATED', targetType: 'Deal', targetId: deal.id, detail: { company, serviceDesc } });

  return json({ deal: serialize(deal) }, { status: 201 });
}

module.exports = { GET, POST };
