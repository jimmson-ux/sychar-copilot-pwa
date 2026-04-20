/**
 * signStudentQR.ts
 *
 * HMAC-SHA256 signing and verification for student Virtual QR payloads.
 *
 * Payload format (the string encoded into the QR image):
 *   {qr_id}.{short_code}.{sig}
 *
 * Where:
 *   qr_id      — XXXX-XXXX opaque identifier (no student info)
 *   short_code — school short code e.g. NKR001
 *   sig        — HMAC-SHA256(key=STUDENT_QR_SECRET, msg="{qr_id}.{short_code}"),
 *                hex-encoded, first 32 chars (128 bits) — compact yet tamper-proof
 *
 * Security properties:
 *   - No student name, admission no., class, or school name on the QR
 *   - Tamper-evident: any bit-flip in qr_id or short_code invalidates sig
 *   - school_id isolation: short_code embeds the school; cross-school replay rejected
 *   - Secret rotation: re-generate all QR tokens after rotating STUDENT_QR_SECRET
 */

const ALGORITHM = 'SHA-256'
const SIG_LEN   = 32   // hex chars = 128-bit truncated HMAC

// ── Web Crypto key import ─────────────────────────────────────────────────────

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.STUDENT_QR_SECRET
  if (!secret) throw new Error('STUDENT_QR_SECRET env var is not set')
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: ALGORITHM },
    false,
    ['sign', 'verify'],
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function computeSig(message: string): Promise<string> {
  const key = await importKey()
  const enc = new TextEncoder()
  const raw = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return bufToHex(raw).slice(0, SIG_LEN)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the signed QR payload string to encode into the QR image.
 * @param qrId      — virtual_qr_id from DB (XXXX-XXXX)
 * @param shortCode — school short code (NKR001)
 * @returns         — "{qrId}.{shortCode}.{sig}"
 */
export async function signStudentQRPayload(
  qrId:      string,
  shortCode: string,
): Promise<string> {
  const message = `${qrId}.${shortCode}`
  const sig     = await computeSig(message)
  return `${message}.${sig}`
}

export interface QRVerifyResult {
  valid:     boolean
  qrId?:     string
  shortCode?: string
  reason?:   string
}

/**
 * Verify a scanned QR payload string.
 * Returns { valid: true, qrId, shortCode } or { valid: false, reason }.
 */
export async function verifyStudentQRPayload(payload: string): Promise<QRVerifyResult> {
  const parts = payload.split('.')
  if (parts.length !== 3) {
    return { valid: false, reason: 'Malformed payload: expected 3 dot-separated parts' }
  }

  const [qrId, shortCode, receivedSig] = parts

  if (!qrId || !shortCode || !receivedSig) {
    return { valid: false, reason: 'Empty payload segment' }
  }

  const expectedSig = await computeSig(`${qrId}.${shortCode}`)

  // Constant-time comparison to prevent timing attacks
  if (expectedSig.length !== receivedSig.length) {
    return { valid: false, reason: 'Signature length mismatch' }
  }

  let diff = 0
  for (let i = 0; i < expectedSig.length; i++) {
    diff |= expectedSig.charCodeAt(i) ^ receivedSig.charCodeAt(i)
  }

  if (diff !== 0) {
    return { valid: false, reason: 'Signature mismatch — tampered payload' }
  }

  return { valid: true, qrId, shortCode }
}
