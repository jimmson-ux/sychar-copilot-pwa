import { NextResponse } from 'next/server'
import { requireAuth, type AuthOk } from './requireAuth'
import { rateLimit, LIMITS } from './rateLimit'

export type AuthContext = AuthOk

// Use at the top of every protected API route.
// Wraps existing requireAuth() with per-IP rate limiting.
export async function requireAuthWithLimit(
  req: Request,
  options?: { limitType?: keyof typeof LIMITS; rateKey?: string }
): Promise<{ auth: AuthContext } | NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const cfg = options?.limitType ? LIMITS[options.limitType] : LIMITS.API_GENERAL
  const key = options?.rateKey ? `${ip}:${options.rateKey}` : ip
  const { allowed } = rateLimit(key, cfg.max, cfg.window)

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': '60', 'X-RateLimit-Remaining': '0' } }
    )
  }

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  return { auth }
}

// Role guard — call after requireAuthWithLimit
export function requireRole(auth: AuthContext, allowedSubRoles: string[]): NextResponse | null {
  if (!allowedSubRoles.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — insufficient role' }, { status: 403 })
  }
  return null
}

// School guard — prevents cross-school data access
export function requireSchool(auth: AuthContext, requestedSchoolId: string): NextResponse | null {
  const NKOROI_ID = '68bd8d34-f2f0-4297-bd18-093328824d84'
  if (auth.schoolId !== requestedSchoolId) {
    return NextResponse.json({ error: 'Forbidden — wrong school' }, { status: 403 })
  }
  if (requestedSchoolId !== NKOROI_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
