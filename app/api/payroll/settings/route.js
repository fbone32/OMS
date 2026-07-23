const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { PAYROLL_VIEW, PAYROLL_SETTINGS_EDIT } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function serialize(s) {
  return {
    id: s.id,
    ssnitEmployeeRatePct: Number(s.ssnitEmployeeRatePct),
    ssnitEmployerRatePct: Number(s.ssnitEmployerRatePct),
    payeBands: s.payeBands,
    effectiveFrom: s.effectiveFrom,
    notes: s.notes,
    updatedAt: s.updatedAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, PAYROLL_VIEW);
  if (errorResponse) return errorResponse;

  const settings = await prisma.payrollSettings.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  if (!settings) return json({ error: 'No PayrollSettings configured — run the seed script' }, { status: 500 });
  return json({ settings: serialize(settings) });
}

// Editable at runtime by an authorized role — never hard-coded in
// application logic, per the brief's compliance requirement.
async function PATCH(request) {
  const { session, errorResponse } = requireRole(request, PAYROLL_SETTINGS_EDIT);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const current = await prisma.payrollSettings.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  const data = {
    ssnitEmployeeRatePct: body.ssnitEmployeeRatePct ?? current?.ssnitEmployeeRatePct,
    ssnitEmployerRatePct: body.ssnitEmployerRatePct ?? current?.ssnitEmployerRatePct,
    payeBands: body.payeBands ?? current?.payeBands,
    notes: body.notes ?? current?.notes,
    updatedByUserId: session.uid,
  };

  // We insert a new settings row (rather than mutating in place) so the
  // change is itself auditable and old runs remain reproducible against the
  // rates that were effective when they ran.
  const created = await prisma.payrollSettings.create({ data });

  await logAudit({ session, action: 'PAYROLL_SETTINGS_UPDATED', targetType: 'PayrollSettings', targetId: created.id, detail: body });

  return json({ settings: serialize(created) });
}

module.exports = { GET, PATCH };
