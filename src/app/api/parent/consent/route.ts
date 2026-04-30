// GET  /api/parent/consent — check if parent has granted consent
// POST /api/parent/consent — grant consent (body: { version: 'v1.0' })

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const svc = createAdminSupabaseClient()

  const { data } = await svc
    .from('consent_logs')
    .select('action, consent_version, granted_at')
    .eq('parent_id', parent.phone)
    .eq('school_id', parent.schoolId)
    .order('granted_at', { ascending: false })
    .limit(1)
    .single()

  const hasConsent = data?.action === 'granted'

  return NextResponse.json({
    hasConsent,
    version:   data?.consent_version ?? null,
    grantedAt: data?.granted_at      ?? null,
  })
}

export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body    = await req.json().catch(() => ({})) as { version?: string }
  const version = body.version?.trim() ?? 'v1.0'

  const ip        = req.headers.get('cf-connecting-ip')
               ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
               ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const svc = createAdminSupabaseClient()

  const { error } = await svc.from('consent_logs').insert({
    parent_id:       parent.phone,
    school_id:       parent.schoolId,
    consent_version: version,
    action:          'granted',
    ip_address:      ip,
    user_agent:      userAgent,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, version })
}
