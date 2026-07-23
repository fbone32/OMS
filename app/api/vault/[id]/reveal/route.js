// Reveal (or copy) a vault credential's real password. This is the ONLY
// route that ever decrypts/returns a plaintext vault password, and every
// call — reveal or copy — writes an audit log entry, per the brief ("every
// reveal or copy action must write an audit log entry").
const { prisma } = require('../../../../../lib/db');
const { requireRole } = require('../../../../../lib/auth');
const { logAudit } = require('../../../../../lib/audit');
const { VAULT_REVEAL } = require('../../../../../lib/roles');
const { decryptSecret } = require('../../../../../lib/vault-crypto');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

async function POST(request, { params }) {
  const { session, errorResponse } = requireRole(request, VAULT_REVEAL);
  if (errorResponse) return errorResponse;

  let body = {};
  try {
    body = await request.json();
  } catch {
    // purpose defaults to 'reveal' below — an empty body is fine.
  }
  const purpose = body.purpose === 'copy' ? 'copy' : 'reveal';

  const cred = await prisma.vaultCredential.findUnique({ where: { id: params.id } });
  if (!cred) return json({ error: 'Not found' }, { status: 404 });

  let password;
  try {
    password = decryptSecret({ iv: cred.encIv, tag: cred.encTag, data: cred.encData });
  } catch (err) {
    console.error('[vault] failed to decrypt credential — VAULT_ENCRYPTION_KEY likely wrong/unset:', err);
    return json({ error: 'Vault encryption is not configured correctly on this server' }, { status: 503 });
  }

  // Audited on every single reveal/copy, unconditionally — this is the
  // security-critical line the brief calls out, not an optional nicety.
  await logAudit({
    session,
    action: purpose === 'copy' ? 'VAULT_CREDENTIAL_COPIED' : 'VAULT_CREDENTIAL_REVEALED',
    targetType: 'VaultCredential',
    targetId: cred.id,
    detail: { system: cred.system }, // never the password itself
  });

  return json({ password });
}

module.exports = { POST };
