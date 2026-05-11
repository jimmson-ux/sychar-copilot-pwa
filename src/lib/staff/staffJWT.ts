import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const ALG = 'HS256'
const TTL = 60 * 60 * 24 * 30   // 30 days

export interface StaffTokenPayload {
  sub:       string    // staff_records.id (UUID)
  school_id: string
  user_id:   string    // auth.users.id (may be empty string if unlinked)
  role:      string    // sub_role e.g. 'class_teacher', 'hod', 'principal'
  class_id?: string    // for class teachers
}

function getSecret(): Uint8Array {
  const s = process.env.STAFF_JWT_SECRET ?? process.env.PARENT_JWT_SECRET
  if (!s) throw new Error('STAFF_JWT_SECRET env var is not set')
  return new TextEncoder().encode(s)
}

export async function signStaffJWT(payload: StaffTokenPayload): Promise<string> {
  return new SignJWT({ ...payload } as JWTPayload)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TTL}s`)
    .sign(getSecret())
}

export async function verifyStaffJWT(token: string): Promise<StaffTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload as unknown as StaffTokenPayload
  } catch {
    return null
  }
}
