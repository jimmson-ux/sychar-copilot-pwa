// Admin: staff roster seeding for a school.
//   POST { rows: StaffRow[] }   (admin only, school = caller's school)
// Inserts staff_records. sub_role is the authoritative role column (NOT `role`).
// Dup-guarded by (school_id, tsc_number) and (school_id, full_name) so re-runs don't duplicate.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const ADMIN_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'super_admin'])

const csv = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean)
  : typeof v === 'string' ? v.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : []

type Row = {
  full_name: string; sub_role?: string; email?: string; phone?: string
  tsc_number?: string; national_id?: string; department?: string
  departments?: string[] | string; subject_specialization?: string[] | string
  teacher_subjects?: string[] | string; employment_type?: string; assigned_class?: string
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { rows?: Row[] } | null
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'rows[] required' }, { status: 400 })
  if (rows.length > 500) return NextResponse.json({ error: 'max 500 rows per pass' }, { status: 400 })

  const school_id = auth.schoolId!
  const db = svc()

  // Existing staff for this school — skip rows that already match by tsc_number or full_name.
  const { data: have } = await db.from('staff_records').select('full_name, tsc_number').eq('school_id', school_id)
  const haveTsc = new Set((have ?? []).map((s: any) => (s.tsc_number || '').trim()).filter(Boolean))
  const haveName = new Set((have ?? []).map((s: any) => (s.full_name || '').trim().toLowerCase()))

  const toInsert: any[] = []
  let skipped = 0
  for (const r of rows) {
    const name = r.full_name?.trim()
    if (!name) { skipped++; continue }
    const tsc = r.tsc_number?.trim() || null
    if ((tsc && haveTsc.has(tsc)) || haveName.has(name.toLowerCase())) { skipped++; continue }
    const subjects = csv(r.teacher_subjects ?? r.subject_specialization)
    const depts = csv(r.departments ?? r.department)
    toInsert.push({
      school_id,
      full_name: name,
      sub_role: r.sub_role?.trim() || 'teacher',
      email: r.email?.trim() || null,
      phone: r.phone?.trim() || null,
      tsc_number: tsc,
      national_id: r.national_id?.trim() || null,
      department: r.department?.trim() || (depts[0] ?? null),
      departments: depts,
      subject_specialization: subjects,
      teacher_subjects: subjects,
      employment_type: r.employment_type?.trim() || 'permanent',
      assigned_class: r.assigned_class?.trim() || null,
      is_active: true,
      can_login: true,
      force_password_change: true,
      push_recipient: true,
    })
    haveName.add(name.toLowerCase())
    if (tsc) haveTsc.add(tsc)
  }

  let inserted = 0
  const errors: string[] = []
  if (toInsert.length) {
    const { data, error } = await db.from('staff_records').insert(toInsert).select('id')
    if (error) errors.push(error.message); else inserted = (data ?? []).length
  }

  return NextResponse.json({ ok: errors.length === 0, inserted, skipped, errors })
}
