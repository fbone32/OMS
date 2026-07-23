const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { KPI_VIEW, KPI_TARGET_EDIT } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(t) {
  return { metricKey: t.metricKey, label: t.label, targetValue: Number(t.targetValue), unit: t.unit, updatedAt: t.updatedAt };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, KPI_VIEW);
  if (errorResponse) return errorResponse;
  const targets = await prisma.kpiTarget.findMany({ orderBy: { metricKey: 'asc' } });
  return json({ targets: targets.map(serialize) });
}

// Not wired to a target-editing control — the existing KPI Scorecard's
// TARGET column is a read-only display. Verified directly via curl instead,
// same as app/api/attendance/[id]'s correction endpoint.
async function PATCH(request) {
  const { session, errorResponse } = requireRole(request, KPI_TARGET_EDIT);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { metricKey, targetValue } = body;
  if (!metricKey || targetValue === undefined || targetValue === null) {
    return json({ error: 'metricKey and targetValue are required' }, { status: 400 });
  }
  const num = Number(targetValue);
  if (!Number.isFinite(num)) return json({ error: 'targetValue must be a number' }, { status: 400 });

  const target = await prisma.kpiTarget
    .update({ where: { metricKey }, data: { targetValue: num, updatedByUserId: session.uid } })
    .catch(() => null);
  if (!target) return json({ error: 'Not found' }, { status: 404 });

  await logAudit({ session, action: 'KPI_TARGET_UPDATED', targetType: 'KpiTarget', targetId: target.id, detail: { metricKey, targetValue: num } });

  return json({ target: serialize(target) });
}

module.exports = { GET, PATCH };
