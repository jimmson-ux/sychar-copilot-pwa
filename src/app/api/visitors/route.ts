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

// Route a visitor-arrival web push to the right staff by purpose.
// Gated per-school by tenant_configs.settings.visitor_alerts (Oloolaiser ON, Nkoroi OFF).
async function notifyVisitorArrival(
  db: ReturnType<typeof svc>, schoolId: string,
  v: { visitorId: string; name: string; idNumber?: string | null; purpose: string; visitorType?: string | null; hostStaffId?: string | null },
) {
  const { data: tc } = await db.from('tenant_configs').select('settings').eq('school_id', schoolId).maybeSingle()
  if ((tc as { settings?: { visitor_alerts?: boolean } } | null)?.settings?.visitor_alerts !== true) return

  const purpose = v.purpose.toLowerCase()
  const type = (v.visitorType ?? '').toLowerCase()
  const roles = new Set<string>()
  if (type === 'supplier' || /deliver|supply|stock|goods/.test(purpose)) roles.add('storekeeper')
  if (/fee|pay|money|bursar|balance|invoice|arrears/.test(purpose)) roles.add('bursar')
  if (/principal|head ?teacher/.test(purpose)) roles.add('principal')
  if (/deputy/.test(purpose)) { roles.add('deputy_principal'); roles.add('deputy_principal_admin'); roles.add('deputy_principal_academic') }
  const routed = roles.size > 0

  const staffIds = new Set<string>()
  if (roles.size) {
    const { data } = await db.from('staff_records').select('id').eq('school_id', schoolId).in('sub_role', [...roles]).eq('is_active', true)
    for (const r of (data ?? []) as { id: string }[]) staffIds.add(r.id)
  }
  if (!routed) {
    // general office visit → current Teacher-on-Duty
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })).toISOString().slice(0, 10)
    const { data: tod } = await db.from('tod_master_schedule').select('assigned_teacher_id')
      .eq('school_id', schoolId).lte('start_date', today).gte('end_date', today).maybeSingle()
    const tid = (tod as { assigned_teacher_id?: string } | null)?.assigned_teacher_id
    if (tid) staffIds.add(tid)
  }
  if (v.hostStaffId) staffIds.add(v.hostStaffId)
  if (!staffIds.size) return

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  await fetch(`${base}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      school_id: schoolId,
      audience: 'staff',
      value: [...staffIds],
      payload: {
        title: `🚪 Visitor at gate: ${v.name}`,
        body: `${v.purpose}${v.idNumber ? ` · ID ${v.idNumber}` : ''}. Tap to open the visitor book.`,
        url: '/visitors', tag: `visitor-${v.visitorId}`, renotify: true,
      },
    }),
  }).catch(() => {})
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

  // Gate log alert — visible to Teacher-on-Duty / Principal / Deputy (digital visitor book).
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'visitor_checkin',
    severity:  'low',
    title:     `Visitor IN: ${body.visitorName.trim()}${body.idNumber ? ` (ID ${body.idNumber})` : ''} — ${body.purpose.trim()}`,
    detail:    { visitor_id: v.id, id_number: body.idNumber ?? null, phone: body.phone ?? null, purpose: body.purpose.trim(), host_staff_id: body.hostStaffId ?? null, direction: 'in' },
  }).then(() => {}, () => {})

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

  // Role-routed visitor web push (Oloolaiser + future schools; gated by tenant flag).
  await notifyVisitorArrival(db, auth.schoolId!, {
    visitorId: v.id,
    name: body.visitorName.trim(),
    idNumber: body.idNumber ?? null,
    purpose: body.purpose.trim(),
    visitorType: body.visitorType ?? null,
    hostStaffId: body.hostStaffId ?? null,
  }).catch(() => {})

  return NextResponse.json({ visitorId: v.id, checkInTime: v.check_in_time })
}

// PATCH /api/visitors — sign a visitor OUT (records check_out_time; clears overstay).
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  const body = await req.json().catch(() => ({})) as { visitorId?: string }
  if (!body.visitorId) return NextResponse.json({ error: 'visitorId required' }, { status: 400 })

  const db = svc()
  const { data, error } = await db.from('visitor_log')
    .update({ check_out_time: new Date().toISOString() })
    .eq('id', body.visitorId).eq('school_id', auth.schoolId!).is('check_out_time', null)
    .select('id, visitor_name, check_out_time').single()
  if (error || !data) return NextResponse.json({ error: 'Visitor not found or already signed out' }, { status: 404 })

  const v = data as { id: string; visitor_name: string; check_out_time: string }
  await db.from('alerts').insert({
    school_id: auth.schoolId, type: 'visitor_checkout', severity: 'low',
    title: `Visitor OUT: ${v.visitor_name}`, detail: { visitor_id: v.id, direction: 'out' },
  }).then(() => {}, () => {})
  return NextResponse.json({ ok: true, visitorId: v.id, checkOutTime: v.check_out_time })
}
