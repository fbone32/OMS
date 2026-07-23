// Prisma client singleton + DATABASE_URL resolution.
//
// Vercel's current Postgres storage integrations (Neon / Supabase marketplace
// products — the original first-party "Vercel Postgres" product now provisions
// through these) set several connection-string env vars, and the exact set
// varies by which integration is attached: DATABASE_URL, POSTGRES_URL,
// POSTGRES_PRISMA_URL (pooled, pgbouncer), POSTGRES_URL_NON_POOLING. We accept
// whichever is present, preferring an explicit DATABASE_URL (matches this
// repo's Prisma schema `env("DATABASE_URL")`), then the Prisma-flavored pooled
// URL, then the plain pooled URL, then the direct/non-pooling URL. This lets
// the app boot fine with any of these attached without code changes.
//
// IMPORTANT: this only resolves which URL string to use — it does not open a
// connection. `prisma generate` (run at build time) never touches this file's
// env lookups at all, so a missing DATABASE_URL never breaks the build, only
// actual query calls at request time.
if (!process.env.DATABASE_URL) {
  const fallback =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (fallback) process.env.DATABASE_URL = fallback;
}

const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__omsPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__omsPrisma = prisma;
}

module.exports = { prisma };
