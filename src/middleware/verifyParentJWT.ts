/**
 * verifyParentJWT.ts
 *
 * Middleware helper for parent-facing API routes.
 * Usage in a route handler:
 *
 *   const parent = await requireParentAuth(req)
 *   if (parent.unauthorized) return parent.unauthorized
 *   // parent.schoolId, parent.studentIds, parent.phone are now verified
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyParentJWT, type ParentTokenPayload } from '@/lib/parent/parentJWT'

export interface ParentAuthOk {
  phone:      string
  schoolId:   string
  studentIds: string[]
  sessionId:  string
  unauthorized: null
}

export interface ParentAuthFail {
  phone:      null
  schoolId:   null
  studentIds: null
  sessionId:  null
  unauthorized: NextResponse
}

export async function requireParentAuth(
  req: NextRequest,
): Promise<ParentAuthOk | ParentAuthFail> {
  const fail = (msg: string, status = 401): ParentAuthFail => ({
    phone: null, schoolId: null, studentIds: null, sessionId: null,
    unauthorized: NextResponse.json({ error: msg }, { status }),
  })

  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return fail('Missing or malformed Authorization header')
  }

  const token = authHeader.slice(7)
  const payload: ParentTokenPayload | null = await verifyParentJWT(token)

  if (!payload) {
    return fail('Invalid or expired parent token')
  }

  if (!payload.school_id || !payload.student_ids?.length || !payload.sub) {
    return fail('Malformed token payload')
  }

  return {
    phone:        payload.sub,
    schoolId:     payload.school_id,
    studentIds:   payload.student_ids,
    sessionId:    payload.session_id,
    unauthorized: null,
  }
}
