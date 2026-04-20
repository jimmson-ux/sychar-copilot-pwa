// POST /api/hod/onboard-token
// Generates a signed onboarding link for the HOD's department.
// Token is valid for 30 days and can be used by any unboarded teacher.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createHmac } from 'crypto'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const HOD_ROLES = new Set([
  'hod_sciences', 'hod_mathematics', 'hod_languages',
  'hod_humanities', 'hod_applied_sciences',
])

function deptFromRole(role: string): string {
  return role.replace('hod_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export async function POST() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { subRole, schoolId, userId } = auth

  if (!HOD_ROLES.has(subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: HOD role required' }, { status: 403 })
  }

  const secret = process.env.HOD_ONBOARD_SECRET
  if (!secret) return NextResponse.json({ error: 'HOD_ONBOARD_SECRET not configured' }, { status: 500 })

  const db = svc()
  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', userId!).eq('school_id', schoolId!).single()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  const payload = {
    dept:      deptFromRole(subRole ?? ''),
    school_id: schoolId,
    hod_id:    staff.id,
    exp:       Date.now() + 30 * 24 * 3600 * 1000,  // 30 days
  }

  const payloadStr = JSON.stringify(payload)
  const sig        = createHmac('sha256', secret).update(payloadStr).digest('hex')
  const token      = Buffer.from(`${payloadStr}.${sig}`).toString('base64url')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${process.env.VERCEL_URL ?? 'localhost:3000'}`
  const link    = `${baseUrl}/onboard/${token}`

  return NextResponse.json({
    token,
    link,
    dept:       payload.dept,
    expires_at: new Date(payload.exp).toISOString(),
  })
}

export async function GET() {
  // HODs can also GET to regenerate / view the current token
  return POST()
}
