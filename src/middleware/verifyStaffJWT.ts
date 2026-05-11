import { NextRequest, NextResponse } from 'next/server'
import { verifyStaffJWT, type StaffTokenPayload } from '@/lib/staff/staffJWT'

export interface StaffAuthOk {
  staffId:      string
  schoolId:     string
  userId:       string
  role:         string
  classId:      string | undefined
  unauthorized: null
}

export interface StaffAuthFail {
  staffId:      null
  schoolId:     null
  userId:       null
  role:         null
  classId:      null
  unauthorized: NextResponse
}

export async function requireStaffAuth(
  req: NextRequest,
): Promise<StaffAuthOk | StaffAuthFail> {
  const fail = (msg: string, status = 401): StaffAuthFail => ({
    staffId: null, schoolId: null, userId: null, role: null, classId: null,
    unauthorized: NextResponse.json({ error: msg }, { status }),
  })

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return fail('Missing or malformed Authorization header')
  }

  const token = authHeader.slice(7)
  const payload: StaffTokenPayload | null = await verifyStaffJWT(token)

  if (!payload) return fail('Invalid or expired staff token')
  if (!payload.school_id || !payload.sub) return fail('Malformed token payload')

  return {
    staffId:      payload.sub,
    schoolId:     payload.school_id,
    userId:       payload.user_id ?? '',
    role:         payload.role ?? '',
    classId:      payload.class_id,
    unauthorized: null,
  }
}
