const { prisma } = require('../../../../lib/db');
const { requireRole } = require('../../../../lib/auth');
const { logAudit } = require('../../../../lib/audit');
const { SCHEDULING_MANAGE } = require('../../../../lib/roles');
const { mondayOf } = require('../../../../lib/scheduling');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Publishing locks further edits (assign/swap start rejecting once
// published=true) and is where a real deployment would notify staff by
// email/SMS — no real notification is sent here, only the published state
// is tracked, per the brief.
async function POST(request) {
  const { session, errorResponse } = requireRole(request, SCHEDULING_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const branch = body.branch;
  if (!branch) return json({ error: 'branch is required' }, { status: 400 });

  const weekStart = mondayOf(new Date());
  const result = await prisma.shiftRosterEntry.updateMany({
    where: { branch, weekStart },
    data: { published: true, publishedAt: new Date() },
  });

  await logAudit({ session, action: 'ROSTER_PUBLISHED', targetType: 'ShiftRosterEntry', targetId: null, detail: { branch, weekStart, count: result.count } });

  return json({ ok: true, count: result.count });
}

module.exports = { POST };
