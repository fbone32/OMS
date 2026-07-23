// Contracts register (Phase 4) — a single register of client/staff/vendor
// agreements. CLIENT-type rows are created automatically by the Sales
// "convert to client" handoff (see app/api/sales/deals/[id]/convert);
// STAFF/VENDOR rows are added directly here by Director/Accountant.
const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { CONTRACTS_VIEW, CONTRACTS_MANAGE } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function renewalStatus(c) {
  if (c.status === 'TERMINATED' || c.status === 'EXPIRED') return c.status;
  if (c.renewalDueDate) {
    const daysOut = (new Date(c.renewalDueDate) - Date.now()) / 86400000;
    if (daysOut < 0) return 'EXPIRED';
    if (daysOut <= 60) return 'RENEWAL_DUE';
  }
  return 'ACTIVE';
}

function serialize(c) {
  return {
    id: c.id,
    type: c.type,
    title: c.title,
    clientId: c.clientId,
    clientName: c.client ? c.client.name : null,
    employeeId: c.employeeId,
    employeeName: c.employee ? c.employee.name : null,
    vendorName: c.vendorName,
    value: c.value != null ? Number(c.value) : null,
    currency: c.currency,
    startDate: c.startDate,
    endDate: c.endDate,
    renewalDueDate: c.renewalDueDate,
    status: renewalStatus(c),
    notes: c.notes,
    reminderSentAt: c.reminderSentAt,
    createdAt: c.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, CONTRACTS_VIEW);
  if (errorResponse) return errorResponse;

  const contracts = await prisma.contract.findMany({
    include: { client: true, employee: true },
    orderBy: [{ createdAt: 'desc' }],
  });
  return json({ contracts: contracts.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, CONTRACTS_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const type = (body.type || '').toUpperCase();
  const title = (body.title || '').trim();
  if (!['CLIENT', 'STAFF', 'VENDOR'].includes(type)) {
    return json({ error: "type must be 'CLIENT', 'STAFF' or 'VENDOR'" }, { status: 400 });
  }
  if (!title) return json({ error: 'title is required' }, { status: 400 });
  if (!body.startDate) return json({ error: 'startDate is required' }, { status: 400 });
  if (type === 'CLIENT' && !body.clientId) return json({ error: 'clientId is required for a CLIENT contract' }, { status: 400 });
  if (type === 'STAFF' && !body.employeeId) return json({ error: 'employeeId is required for a STAFF contract' }, { status: 400 });
  if (type === 'VENDOR' && !(body.vendorName || '').trim()) return json({ error: 'vendorName is required for a VENDOR contract' }, { status: 400 });

  const contract = await prisma.contract.create({
    data: {
      type,
      title,
      clientId: type === 'CLIENT' ? body.clientId : null,
      employeeId: type === 'STAFF' ? body.employeeId : null,
      vendorName: type === 'VENDOR' ? body.vendorName.trim() : null,
      value: body.value != null && body.value !== '' ? body.value : null,
      currency: body.currency || 'GH₵',
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      renewalDueDate: body.renewalDueDate ? new Date(body.renewalDueDate) : null,
      notes: body.notes || null,
      createdByUserId: session.uid,
    },
    include: { client: true, employee: true },
  });

  await logAudit({ session, action: 'CONTRACT_CREATED', targetType: 'Contract', targetId: contract.id, detail: { type, title } });

  return json({ contract: serialize(contract) }, { status: 201 });
}

module.exports = { GET, POST };
