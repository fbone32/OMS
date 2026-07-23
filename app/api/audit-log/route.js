const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { AUDIT_LOG_VIEW } = require('../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function GET(request) {
  const { errorResponse } = requireRole(request, AUDIT_LOG_VIEW);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const take = Math.min(200, Number(url.searchParams.get('take')) || 50);

  const entries = await prisma.auditLogEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take,
  });
  return json({ entries });
}

module.exports = { GET };
