// Prisma client singleton for the job-website app's OWN schema/tables.
// Same DATABASE_URL as the root OMS app (shared Postgres instance/database —
// see prisma/schema.prisma's header comment) but a completely separate
// generated client (this app has its own package.json/node_modules, so
// `@prisma/client` here is generated from THIS app's schema.prisma, not the
// root app's) — it has no knowledge of Employee/User/Payroll/etc tables.
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
  globalForPrisma.__obaJobsPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__obaJobsPrisma = prisma;
}

module.exports = { prisma };
