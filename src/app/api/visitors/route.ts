// GET  /api/visitors — list today's visitors (security/principal)
// POST /api/visitors — log a new visitor (feature: visitor_log)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const VIEW_ROLES = new Set([
  'principal', 'deputy_principal', 'deputy_admin', 'security', 'bursar',
])

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!VIEW_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!await tenantHasFeature(auth.schoolId!, 'visitor_log')) {
    return NextResponse.json({ error: 'visitor_log feature not enabled for this school' }, { status: 403 })
  }

  const db  = svc()
  const now = new Date()
  const todayNairobi = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Nairobi' }))
    .toISOString().split('T')[0]

  const { data, error } = await db
    .from('visitor_log')
    .select(`
      id, full_name, visitor_name, id_number, phone, purpose,
      visitor_type, company, vehicle_reg, expected_duration_minutes,
      check_in_time, check_out_time, overstay_alerted, banned, ban_reason,
      staff_records!host_staff_id ( full_name )
    `)
    .eq('school_id', auth.schoolId!)
    .gte('check_in_time', `${todayNairobi}T00:00:00`)
    .order('check_in_time', { ascending: false })

  if (error) {
    console.error('[visitors] GET error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ visitors: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!VIEW_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!await tenantHasFeature(auth.schoolId!, 'visitor_log')) {
    return NextResponse.json({ error: 'visitor_log feature not enabled' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    visitorName:              string
    idNumber?:                string
    phone?:                   string
    purpose:                  string
    hostStaffId?:             string
    visitorType?:             string
    company?:                 string
    vehicleReg?:              string
    expectedDurationMinutes?: number
  } | null

  if (!body?.visitorName?.trim() || !body.purpose?.trim()) {
    return NextResponse.json({ error: 'visitorName and purpose required' }, { status: 400 })
  }

  const db = svc()

  // Check visitor_bans by phone or idNumber
  if (body.phone || body.idNumber) {
    const conditions: string[] = []
    if (body.phone)    conditions.push(`phone.eq.${body.phone}`)
    if (body.idNumber) conditions.push(`id_number.eq.${body.idNumber}`)

    let banQuery = db.from('visitor_bans').select('id, reason').eq('school_id', auth.schoolId!)
    if (body.phone)    banQuery = banQuery.or(`phone.eq.${body.phone}`)
    if (body.idNumber) banQuery = (body.phone
      ? banQuery.or(`id_number.eq.${body.idNumber}`)
      : banQuery.or(`id_number.eq.${body.idNumber}`)
    )

    const { data: ban } = await banQuery.limit(1).single()
    if (ban) {
      return NextResponse.json(
        { banned: true, reason: (ban as { reason: string }).reason },
        { status: 403 }
      )
    }
  }

  const now = new Date().toISOString()

  const { data, error } = await db
    .from('visitor_log')
    .insert({
      school_id:                  auth.schoolId,
      full_name:                  body.visitorName.trim(),
      visitor_name:               body.visitorName.trim(),
      id_number:                  body.idNumber ?? null,
      phone:                      body.phone ?? null,
      purpose:                    body.purpose.trim(),
      host_staff_id:              body.hostStaffId ?? null,
      visitor_type:               body.visitorType ?? 'other',
      company:                    body.company ?? null,
      vehicle_reg:                body.vehicleReg ?? null,
      expected_duration_minutes:  body.expectedDurationMinutes ?? 60,
      check_in_time:              now,
      check_in_at:                now,
      overstay_alerted:           false,
      banned:                     false,
      recorded_by:                auth.userId,
    })
    .select('id, check_in_time')
    .single()

  if (error) {
    console.error('[visitors] POST error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const v = data as { id: string; check_in_time: string }

  // Notify host staff
  if (body.hostStaffId) {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'visitor_arrived',
      severity:  'low',
      title:     `Visitor arrived for you: ${body.visitorName.trim()}${body.company ? ` from ${body.company}` : ''}. Purpose: ${body.purpose.trim()}`,
      detail:    { visitor_id: v.id, host_staff_id: body.hostStaffId, visitor_type: body.visitorType },
    }).then(() => {}, () => {})
  }

  // Notify storekeeper for suppliers
  if (body.visitorType === 'supplier') {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'supplier_arrived',
      severity:  'low',
      title:     `Supplier at gate: ${body.visitorName.trim()}${body.company ? ` (${body.company})` : ''}. Purpose: ${body.purpose.trim()}`,
      detail:    { visitor_id: v.id, company: body.company },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ visitorId: v.id, checkInTime: v.check_in_time })
}
