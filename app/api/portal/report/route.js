// Downloadable client report (Phase 4) — generated fresh from real data on
// every request (never a stored/stale file), same clientId isolation rule as
// app/api/portal/summary: a CLIENT session can only ever generate its own
// report, regardless of any clientId in the query string.
const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { PORTAL_VIEW } = require('../../../../lib/roles');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function GET(request) {
  const { session, errorResponse } = requireRole(request, PORTAL_VIEW);
  if (errorResponse) return errorResponse;

  const url = new URL(request.url);
  const clientId = session.role === 'CLIENT' ? session.clientId : url.searchParams.get('clientId');
  if (!clientId) return json({ error: 'clientId is required' }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return json({ error: 'Not found' }, { status: 404 });
  if (session.role === 'CLIENT' && client.id !== session.clientId) {
    return json({ error: 'Not found' }, { status: 404 });
  }

  const staff = await prisma.employee.findMany({ where: { clientId: client.id }, orderBy: { name: 'asc' } });
  const staffIds = staff.map((e) => e.id);
  const qaAudits = staffIds.length ? await prisma.qaAudit.findMany({ where: { employeeId: { in: staffIds } } }) : [];
  const qaByEmployee = {};
  for (const q of qaAudits) {
    const b = (qaByEmployee[q.employeeId] = qaByEmployee[q.employeeId] || { count: 0, sum: 0 });
    b.count += 1;
    b.sum += q.score;
  }

  const rows = [['Name', 'Role', 'Branch', 'QA Audits', 'Avg QA Score']];
  for (const e of staff) {
    const qa = qaByEmployee[e.id];
    rows.push([e.name, e.jobTitle, e.branch, qa ? qa.count : 0, qa ? Math.round((qa.sum / qa.count) * 10) / 10 : '']);
  }
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const fileName = `${client.name.replace(/[^a-z0-9]+/gi, '-')}-report-${new Date().toISOString().slice(0, 10)}.csv`;

  await logAudit({ session, action: 'PORTAL_REPORT_DOWNLOADED', targetType: 'Client', targetId: client.id, detail: { fileName } });

  return json({
    fileName,
    mimeType: 'text/csv',
    dataUrl: 'data:text/csv;base64,' + Buffer.from(csv, 'utf8').toString('base64'),
  });
}

module.exports = { GET };
