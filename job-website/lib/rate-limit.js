// DB-backed rate limiter for public, unauthenticated endpoints (job search
// is cheap/read-only and left unlimited; the apply endpoint accepts a file
// upload and writes rows, so it's the one that needs real throttling).
// Deliberately DB-backed rather than in-memory (see prisma/schema.prisma's
// RateLimitHit comment) since Vercel serverless instances are ephemeral.
const { prisma } = require('./db');

async function checkRateLimit(bucketKey, { limit = 6, windowMs = 60_000 } = {}) {
  const since = new Date(Date.now() - windowMs);
  const count = await prisma.rateLimitHit.count({
    where: { bucketKey, createdAt: { gte: since } },
  });
  if (count >= limit) return false;
  await prisma.rateLimitHit.create({ data: { bucketKey } });
  return true;
}

function clientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// Best-effort cleanup so the table doesn't grow forever — called
// opportunistically (cheap, small delete) rather than via a dedicated cron.
async function pruneOldHits() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: cutoff } } });
  } catch {
    // best-effort only
  }
}

module.exports = { checkRateLimit, clientIp, pruneOldHits };
