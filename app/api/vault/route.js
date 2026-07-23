// Credentials Vault (Phase 4) — shared company logins, restricted to
// Director + IT & Facilities only (lib/roles.js VAULT_*). The list response
// NEVER includes the decrypted password — only masked placeholder + strength
// heuristic — the real password is only ever returned by the dedicated,
// audited POST .../reveal route.
const { prisma } = require('../../../lib/db');
const { requireRole } = require('../../../lib/auth');
const { logAudit } = require('../../../lib/audit');
const { VAULT_VIEW, VAULT_MANAGE } = require('../../../lib/roles');
const { encryptSecret } = require('../../../lib/vault-crypto');

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init && init.headers) },
  });
}

// A rough, real (not fabricated) strength heuristic computed from the
// actual decrypted length/character classes at write time, stored alongside
// so the list view can show it without ever decrypting on every GET.
function strengthOf(password) {
  let score = 0;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  if (score >= 4) return 'Strong';
  if (score >= 2) return 'Medium';
  return 'Weak';
}

function serialize(v) {
  return {
    id: v.id,
    system: v.system,
    category: v.category,
    username: v.username,
    // Masked placeholder only — never the real length/content.
    passwordMasked: '••••••••••••',
    strength: v.strength,
    notes: v.notes,
    createdByEmail: v.createdBy ? v.createdBy.email : null,
    updatedAt: v.updatedAt,
    createdAt: v.createdAt,
  };
}

async function GET(request) {
  const { errorResponse } = requireRole(request, VAULT_VIEW);
  if (errorResponse) return errorResponse;

  const creds = await prisma.vaultCredential.findMany({
    include: { createdBy: true },
    orderBy: [{ system: 'asc' }],
  });
  return json({ credentials: creds.map(serialize) });
}

async function POST(request) {
  const { session, errorResponse } = requireRole(request, VAULT_MANAGE);
  if (errorResponse) return errorResponse;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const system = (body.system || '').trim();
  const username = (body.username || '').trim();
  const password = body.password || '';
  const category = (body.category || 'OTHER').toUpperCase();
  if (!system || !username || !password) {
    return json({ error: 'system, username and password are required' }, { status: 400 });
  }
  if (!['BANKING', 'GOVERNMENT', 'SOFTWARE', 'SOCIAL', 'OTHER'].includes(category)) {
    return json({ error: 'Invalid category' }, { status: 400 });
  }

  let enc;
  try {
    enc = encryptSecret(password);
  } catch (err) {
    console.error('[vault] failed to encrypt credential — VAULT_ENCRYPTION_KEY likely unset:', err);
    return json({ error: 'Vault encryption is not configured on this server (missing VAULT_ENCRYPTION_KEY)' }, { status: 503 });
  }

  const cred = await prisma.vaultCredential.create({
    data: {
      system,
      category,
      username,
      encIv: enc.iv,
      encTag: enc.tag,
      encData: enc.data,
      strength: strengthOf(password),
      notes: body.notes || null,
      createdByUserId: session.uid,
    },
    include: { createdBy: true },
  });

  // Never log the password itself, not even the masked strength label
  // computed above — the audit trail records WHO added WHAT system's
  // credential, not the secret.
  await logAudit({ session, action: 'VAULT_CREDENTIAL_ADDED', targetType: 'VaultCredential', targetId: cred.id, detail: { system, category } });

  return json({ credential: serialize(cred) }, { status: 201 });
}

module.exports = { GET, POST };
