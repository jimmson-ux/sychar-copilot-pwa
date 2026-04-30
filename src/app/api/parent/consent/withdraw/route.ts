// POST /api/parent/consent/withdraw
// Records consent withdrawal and clears the parent's active sessions.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const ip        = req.headers.get('cf-connecting-ip')
               ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
               ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const svc = createAdminSupabaseClient()

  // Record withdrawal (immutable audit trail)
  await svc.from('consent_logs').insert({
    parent_id:       parent.phone,
    school_id:       parent.schoolId,
    consent_version: 'v1.0',
    action:          'withdrawn',
    ip_address:      ip,
    user_agent:      userAgent,
  })

  // Clear any active parent sessions
  await svc
    .from('parent_sessions')
    .delete()
    .eq('parent_phone', parent.phone)
    .eq('school_id', parent.schoolId)

  return NextResponse.json({ ok: true })
}
