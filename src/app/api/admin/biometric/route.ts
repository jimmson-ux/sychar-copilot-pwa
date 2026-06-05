// Admin: register fingerprint devices + enroll device-user-ids -> students/teachers.
//   GET  /api/admin/biometric            -> list devices + enrollment counts
//   POST { action: 'register_device', serial_number, device_role?, label?, push_token? }
//   POST { action: 'enroll', device_serial, device_user_id, subject_type, student_id?, staff_id? }
//   POST { action: 'enroll_bulk', rows: [...] }
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const ADMIN_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'super_admin'])

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = svc()
  const { data: devices } = await db.from('biometric_devices').select('*').eq('school_id', auth.schoolId!).order('created_at', { ascending: false })
  const { count } = await db.from('biometric_enrollments').select('*', { count: 'exact', head: true }).eq('school_id', auth.schoolId!)
  return NextResponse.json({ devices: devices ?? [], enrollment_count: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null) as any
  if (!body?.action) return NextResponse.json({ error: 'action required' }, { status: 400 })
  const db = svc()
  const school_id = auth.schoolId!

  if (body.action === 'register_device') {
    if (!body.serial_number) return NextResponse.json({ error: 'serial_number required' }, { status: 400 })
    const { data, error } = await db.from('biometric_devices').upsert({
      school_id,
      serial_number: String(body.serial_number).trim(),
      device_role: body.device_role ?? 'both',
      label: body.label ?? null,
      push_token: body.push_token ?? null,
      is_active: true,
    }, { onConflict: 'serial_number' }).select('id, serial_number').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, device: data })
  }

  if (body.action === 'enroll' || body.action === 'enroll_bulk') {
    const rows = (body.action === 'enroll_bulk' ? body.rows : [body]) as any[]
    const toInsert = (rows ?? [])
      .filter((r) => r?.device_serial && r?.device_user_id)
      .map((r) => ({
        school_id,
        device_serial: String(r.device_serial).trim(),
        device_user_id: String(r.device_user_id).trim(),
        subject_type: r.subject_type === 'teacher' ? 'teacher' : 'student',
        student_id: r.student_id ?? null,
        staff_id: r.staff_id ?? null,
      }))
    if (!toInsert.length) return NextResponse.json({ error: 'no valid rows' }, { status: 400 })
    const { error } = await db.from('biometric_enrollments').upsert(toInsert, { onConflict: 'device_serial,device_user_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, enrolled: toInsert.length })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
