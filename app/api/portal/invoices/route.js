// Client Portal's own invoices — same clientId isolation rule as
// app/api/portal/summary and app/api/portal/report: a CLIENT session's
// clientId ALWAYS comes from the verified session cookie, never a query
// param, so a client login can never see another client's invoices.
// Internal roles (Director/Business Development/Board Advisor) may pass
// ?clientId= to view a specific client, matching the existing isPortal
// screen's client selector. Never returns DRAFT invoices — a client should
// only ever see one once it's actually been sent to them.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { PORTAL_VIEW } = require('../../../../lib/roles');
const { serializeInvoice } = require('../../../../lib/invoices');

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
  if (!clientId) return json({ invoices: [] });
  if (session.role === 'CLIENT' && clientId !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { clientId, status: { not: 'DRAFT' } },
    include: { client: true, lineItems: true },
    orderBy: [{ createdAt: 'desc' }],
  });
  return json({ invoices: invoices.map(serializeInvoice) });
}

module.exports = { GET };
