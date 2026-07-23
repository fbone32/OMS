const { retryPendingSyncs } = require('../../../../lib/oms-sync');
const { getSession } = require('../../../../lib/auth');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// Retry-queue trigger. Two ways in, both intentional:
//  - a Vercel Cron hitting this on a schedule (see vercel.json), authenticated
//    with the shared secret header (Vercel Cron requests carry no cookies).
//  - an authenticated admin session (the applicants dashboard also calls
//    retryPendingSyncs() inline on its own GET, but exposing this
//    separately lets an admin manually force a retry sweep too).
function isAuthorized(request) {
  const secret = request.headers.get('x-job-website-secret');
  if (secret && secret === process.env.JOB_WEBSITE_API_SECRET) return true;
  const cronHeader = request.headers.get('authorization');
  if (cronHeader && process.env.CRON_SECRET && cronHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  return !!getSession(request);
}

async function POST(request) {
  if (!isAuthorized(request)) return json({ error: 'Unauthorized' }, { status: 401 });
  const results = await retryPendingSyncs(25, request);
  return json({ ok: true, attempted: results.length, results });
}

// Vercel Cron sends GET requests to the configured path.
async function GET(request) {
  return POST(request);
}

module.exports = { GET, POST };
