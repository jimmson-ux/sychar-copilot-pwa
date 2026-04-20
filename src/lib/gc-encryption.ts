// G&C Sanctuary — AES-256-GCM encryption for Tier 1 session notes.
// Key source: GC_ENCRYPTION_KEY env var (32-byte hex or 44-char base64).
// Format stored in DB: "base64(iv):base64(authTag):base64(ciphertext)"
//
// SECURITY PROPERTIES:
// - AES-256-GCM provides authenticated encryption (integrity + confidentiality)
// - Random 96-bit IV per record — never reused
// - authTag (16 bytes) detects tampering
// - Key never leaves server; only ciphertext strings are stored in Postgres
// - Principal CANNOT read without counselor authorization (enforced at RLS level)

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const raw = process.env.GC_ENCRYPTION_KEY
  if (!raw) throw new Error('GC_ENCRYPTION_KEY not set')
  // Accept hex (64 chars) or base64 (44 chars)
  const buf = raw.length === 64 ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error(`GC_ENCRYPTION_KEY must be 32 bytes (got ${buf.length})`)
  return buf
}

// ── Encrypt plaintext → stored string ────────────────────────────────────────

export function gcEncrypt(plaintext: string): string {
  if (!plaintext) return ''
  const key = getKey()
  const iv  = crypto.randomBytes(12)           // 96-bit IV — recommended for GCM
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()              // 16-byte authentication tag
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    enc.toString('base64'),
  ].join(':')
}

// ── Decrypt stored string → plaintext ────────────────────────────────────────

export function gcDecrypt(stored: string): string {
  if (!stored) return ''
  const key = getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')
  const [ivB64, tagB64, dataB64] = parts
  const iv      = Buffer.from(ivB64,   'base64')
  const authTag = Buffer.from(tagB64,  'base64')
  const data    = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    throw new Error('Decryption failed — data may be tampered or wrong key')
  }
}

// ── Helper: encrypt only if non-empty, otherwise return null ─────────────────

export function encryptField(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  return gcEncrypt(value)
}

export function decryptField(stored: string | null | undefined): string | null {
  if (!stored) return null
  try {
    return gcDecrypt(stored)
  } catch {
    return '[Decryption error]'
  }
}
