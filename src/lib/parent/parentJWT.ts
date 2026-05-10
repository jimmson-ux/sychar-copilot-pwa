/**
 * parentJWT.ts
 *
 * Sign and verify parent JWTs.
 * Payload contains ONLY server-resolved data — school_id and student_ids
 * are NEVER taken from the request body (they are resolved from DB at auth time).
 *
 * Token TTL: 30 days (parents should stay logged in across app sessions).
 * Algorithm: HMAC-SHA256 (HS256) — symmetric, no key distribution needed.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const ALG = 'HS256'
const TTL = 60 * 60 * 24 * 30   // 30 days in seconds

export interface ParentTokenPayload {
  sub:          string     // student UUID (primary verified student)
  school_id:    string     // UUID
  student_ids:  string[]   // UUIDs of all verified students
  session_id?:  string     // optional — only present for legacy OTP sessions
}

function getSecret(): Uint8Array {
  const s = process.env.PARENT_JWT_SECRET
  if (!s) throw new Error('PARENT_JWT_SECRET env var is not set')
  return new TextEncoder().encode(s)
}

export async function signParentJWT(payload: ParentTokenPayload): Promise<string> {
  return new SignJWT({ ...payload } as JWTPayload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(getSecret())
}

export async function verifyParentJWT(token: string): Promise<ParentTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as ParentTokenPayload
  } catch {
    return null
  }
}
