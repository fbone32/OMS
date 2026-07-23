// Shared credential-verification logic used by both the real login route
// (app/api/auth/login) and the production health check (app/api/health),
// so the health check exercises the exact same DB lookup + bcrypt path a
// real sign-in does, rather than a parallel reimplementation that could
// silently drift from it.
const bcrypt = require('bcryptjs');
const { prisma } = require('./db');

/** Looks up `email` and verifies `password` against its stored bcrypt hash.
 * Throws on infrastructure failure (DB unreachable, table missing, etc.) —
 * callers are expected to distinguish that from a normal auth failure,
 * which is instead reported via the returned `ok`/`reason`. Never throws
 * bcrypt.compare failures for a missing user (short-circuits first) so
 * callers can treat "not found" and "wrong password" identically for
 * response purposes, without an extra bcrypt call to hide timing on top of
 * that — this endpoint is not trying to be a timing-safe oracle, it already
 * returns identical response shapes for both cases. */
async function verifyCredentials(email, password) {
  const user = await prisma.user.findUnique({ where: { email }, include: { employee: true, client: true } });
  if (!user) return { ok: false, reason: 'not_found', user: null };
  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return { ok: false, reason: 'bad_password', user: null };
  return { ok: true, reason: null, user };
}

module.exports = { verifyCredentials };
