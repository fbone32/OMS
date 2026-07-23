#!/usr/bin/env node
// Vercel build entrypoint — same pattern as the root OMS app's
// scripts/vercel-build.mjs: resolve whichever Postgres connection-string env
// var the attached Storage integration set, apply pending migrations
// against the REAL database, then build. Fail-closed: if a database IS
// configured but migrate deploy fails, abort the deploy rather than ship
// code next to a schema it doesn't match.
import { spawnSync } from 'node:child_process';

function resolveConnectionStrings() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL_UNPOOLED ||
      '';
  }
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
    '\n[build] WARNING: no Postgres connection string env var found. Skipping ' +
    '`prisma migrate deploy` and continuing the build — the app will build ' +
    'fine but any Prisma-backed route will fail at request time until a ' +
    'Postgres database is attached.\n'
  );
} else {
  run('npx', ['prisma', 'migrate', 'deploy']);
}

run('npx', ['next', 'build']);
