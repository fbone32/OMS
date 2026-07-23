// Real field-level encryption at rest for the Credentials Vault (Phase 4).
// Per the brief: vault passwords must NOT be stored in the same unencrypted
// form as the rest of the application data — this is deliberately
// *encryption* (retrievable), not hashing (one-way, like bcrypt password
// hashes elsewhere in this app), because the whole point of the vault is
// that a Director/IT & Facilities user can reveal the real password again.
//
// AES-256-GCM via Node's built-in crypto: a random 12-byte IV per write, the
// GCM auth tag stored alongside (so tampering with ciphertext at rest is
// detectable), keyed off VAULT_ENCRYPTION_KEY.
//
// *** REQUIRED NEW ENV VAR: VAULT_ENCRYPTION_KEY ***
// Must be set in every environment that reads/writes VaultCredential rows
// (local .env AND the Vercel project's production/preview env vars) — same
// category of gap as SESSION_SECRET (see lib/auth.js), which a prior session
// shipped without confirming was actually configured in production. This
// throws loudly at request time (never falls back to a guessable default)
// if the env var is missing, so a misconfigured deploy fails the vault
// routes immediately and visibly instead of silently storing garbage.
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended GCM nonce size

function getKey() {
  const secret = process.env.VAULT_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('VAULT_ENCRYPTION_KEY env var is not set — cannot encrypt/decrypt vault credentials');
  }
  // Accept either a 32-byte base64/hex string or derive a 32-byte key from
  // whatever string is supplied, so ops doesn't have to hand-generate exact
  // byte lengths — sha256 always yields the 32 bytes AES-256 needs.
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypts `plaintext` (the real password). Returns { iv, tag, data } as
 * base64 strings, ready to store directly in VaultCredential's columns. */
function encryptSecret(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') };
}

/** Reverses encryptSecret — throws if the tag doesn't verify (tampered or
 * wrong key), which is the correct fail-closed behavior for a vault. */
function decryptSecret({ iv, tag, data }) {
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encryptSecret, decryptSecret };
