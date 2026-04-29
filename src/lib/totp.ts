/**
 * totp.ts — TOTP helpers (otplib)
 * Secrets are AES-256-GCM encrypted before storing in staff_records.totp_secret
 *
 * Requires env: TEACHER_TOKEN_SECRET (32-byte hex or any strong string)
 */

interface OTPAuthenticator {
  generateSecret(): string
  keyuri(accountName: string, issuer: string, secret: string): string
  verify(opts: { token: string; secret: string }): boolean
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { authenticator } = require('otplib') as { authenticator: OTPAuthenticator }
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'

function keyBuffer(): Buffer {
  const raw = process.env.TEACHER_TOKEN_SECRET ?? process.env.SYCHAR_QR_SECRET ?? ''
  // Derive a 32-byte key via sha256 of the raw secret
  const { createHash } = require('crypto') as typeof import('crypto')
  return createHash('sha256').update(raw).digest()
}

export function generateTOTPSecret(): string {
  return authenticator.generateSecret()
}

export function verifyTOTP(token: string, encryptedSecret: string): boolean {
  try {
    const secret = decryptSecret(encryptedSecret)
    return authenticator.verify({ token, secret })
  } catch {
    return false
  }
}

export function getTOTPUri(email: string, secret: string, issuer = 'Sychar CoPilot'): string {
  return authenticator.keyuri(email, issuer, secret)
}

export function encryptSecret(plaintext: string): string {
  const iv         = randomBytes(12)
  const cipher     = createCipheriv(ALGO, keyBuffer(), iv)
  const encrypted  = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag    = cipher.getAuthTag()
  // Format: iv(hex):authTag(hex):ciphertext(hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(encrypted: string): string {
  const [ivHex, tagHex, ctHex] = encrypted.split(':')
  if (!ivHex || !tagHex || !ctHex) throw new Error('Invalid encrypted format')
  const iv         = Buffer.from(ivHex, 'hex')
  const authTag    = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(ctHex, 'hex')
  const decipher   = createDecipheriv(ALGO, keyBuffer(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
