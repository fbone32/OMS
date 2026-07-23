#!/usr/bin/env node
// Vercel build entrypoint (invoked by package.json's "build" script).
//
// Why this exists: before this file, "build" was just `next build`, and
// `postinstall` only ran `prisma generate` — which generates typed client
// *code* from schema.prisma but never touches the actual database. Nothing
// in the pipeline ever ran `prisma migrate deploy` against the real
// production DATABASE_URL, so attaching a fresh Postgres database in the
// Vercel Storage tab did nothing on its own: production had zero tables and
// every request that touched Prisma (including login) failed at the
// database layer.
//
// This script, run as part of `npm run build`:
//   1. Resolves whichever Postgres connection-string env var(s) the attached
//      Storage integration (Vercel's Neon/Supabase-backed Postgres product)
//      happened to set — the exact variable names vary by integration and
//      by pooled vs. direct connection.
//   2. Applies pending Prisma migrations against the real database
//      (`prisma migrate deploy` — schema only, never touches app data).
//   3. Runs the idempotent seed script, so the demo accounts/data genuinely
//      exist in whatever database is attached, with no separate manual step.
//   4. Runs `next build`.
//
// Fail-closed by design: if a database IS configured but migrate deploy (or
// the seed) fails, this script exits non-zero, Vercel aborts the deploy, and
// the previous good deployment stays live — better than shipping code next
// to a schema it doesn't match. If NO database is configured at all (e.g. a
// preview build with no Storage integration attached), we log a loud
// warning and continue the build anyway, so unrelated preview/static builds
// aren't blocked on infra that was never wired up for them.
import { spawnSync } from 'node:child_process';

function resolveConnectionStrings() {
  // Prefer a pooled (pgbouncer) connection for the app's normal request-time
  // query traffic — this is what lib/db.js's own runtime fallback prefers
  // too, kept in sync with that file intentionally.
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL_UNPOOLED ||
      '';
  }
  // Prisma Migrate takes out session-level advisory locks while it runs,
  // which transaction-mode connection poolers (pgbouncer, as used by both
  // the Neon and Supabase marketplace integrations Vercel now provisions
  // Postgres through) do not reliably support. Point `directUrl` (used only
  // by `prisma migrate`/`db` CLI commands, never by the generated client) at
  // a non-pooled connection string when one is available, so migrations
  // don't intermittently fail against a pooled URL.
  if (!process.env.DIRECT_URL) {
    process.env.DIRECT_URL =
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      '';
  }
}

function run(cmd, args) {
  console.log(`\n[build] $ ${cmd} ${args.join(' ')}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`[build] "${cmd} ${args.join(' ')}" failed (exit code ${result.status}).`);
    process.exit(result.status || 1);
  }
}

resolveConnectionStrings();

if (!process.env.DATABASE_URL) {
  console.warn(
    '\n[build] WARNING: no Postgres connection string env var found ' +
    '(checked DATABASE_URL, POSTGRES_PRISMA_URL, POSTGRES_URL, ' +
    'POSTGRES_URL_NON_POOLING, DATABASE_URL_UNPOOLED). Skipping ' +
    '`prisma migrate deploy` and the seed step and continuing the build — ' +
    'the app will build fine but any Prisma-backed API route will fail at ' +
    'request time until a Postgres database is attached in this project\'s ' +
    'Storage tab.\n'
  );
} else {
  run('npx', ['prisma', 'migrate', 'deploy']);
  run('node', ['prisma/seed.mjs']);
}

run('npx', ['next', 'build']);
