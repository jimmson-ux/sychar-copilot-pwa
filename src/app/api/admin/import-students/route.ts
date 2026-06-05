// Admin: one-pass Oloolaiser/Nkoroi student seeding.
//   POST { rows: StudentRow[], seed_links?: boolean }   (admin only, school = caller's school)
// Per pass: resolve/create class_id (NOT NULL) -> upsert students (onConflict school_id,admission_no)
// -> seed parent_student_links from parent phones -> (optional) biometric_enrollments when a row
// carries device_serial + device_user_id. Returns counts so onboarding is verifiable.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const ADMIN_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'super_admin'])

function normPhone(p: string | null | undefined): string | null {
  if (!p) return null
  const t = String(p).trim().replace(/\s+/g, '')
  return t ? t.replace(/^\+?254/, '0') : null
}

type Row = {
  full_name: string; admission_no: string; class_name?: string; stream?: string
  gender?: string; boarding_status?: string; form?: number | string
  parent_name?: string; parent_phone?: string; parent2_phone?: string; guardian_phone?: string
  device_serial?: string; device_user_id?: string
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { rows?: Row[]; seed_links?: boolean } | null
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'rows[] required' }, { status: 400 })
  if (rows.length > 1000) return NextResponse.json({ error: 'max 1000 rows per pass' }, { status: 400 })

  const school_id = auth.schoolId!
  const seedLinks = body?.seed_links !== false
  const db = svc()
  const year = String(new Date().getFullYear())

  // 1. Resolve class_id for every distinct class_name (create missing). Fallback bucket "Unassigned".
  const classNames = [...new Set(rows.map((r) => (r.class_name?.trim() || 'Unassigned')))]
  const { data: existing } = await db.from('classes').select('id, name').eq('school_id', school_id)
  const classMap = new Map<string, string>()
  for (const c of (existing ?? []) as { id: string; name: string }[]) classMap.set(c.name.toLowerCase(), c.id)
  const toCreate = classNames.filter((n) => !classMap.has(n.toLowerCase()))
  if (toCreate.length) {
    const { data: created, error: cErr } = await db.from('classes')
      .insert(toCreate.map((name) => ({ school_id, name, year_group: name, academic_year: year })))
      .select('id, name')
    if (cErr) return NextResponse.json({ error: `class create: ${cErr.message}` }, { status: 400 })
    for (const c of (created ?? []) as { id: string; name: string }[]) classMap.set(c.name.toLowerCase(), c.id)
  }

  // 2. Upsert students (chunked) — class_id explicit (NOT NULL), boarding presence starts false.
  const CHUNK = 200
  let studentsUpserted = 0
  const errors: string[] = []
  const admToId = new Map<string, string>()
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => {
      const cname = r.class_name?.trim() || 'Unassigned'
      return {
        school_id,
        class_id: classMap.get(cname.toLowerCase())!,
        full_name: r.full_name.trim(),
        admission_no: r.admission_no.trim().toUpperCase(),
        class_name: cname,
        stream: r.stream?.trim() || null,
        gender: r.gender?.trim() || null,
        boarding_status: r.boarding_status?.trim() || null,
        form: r.form != null && r.form !== '' ? Number(r.form) : null,
        parent_name: r.parent_name?.trim() || null,
        parent_phone: r.parent_phone?.trim() || null,
        parent2_phone: r.parent2_phone?.trim() || null,
        guardian_phone: r.guardian_phone?.trim() || null,
        is_active: true,
        is_in_school: false,
      }
    })
    const { data: up, error } = await db.from('students')
      .upsert(chunk, { onConflict: 'school_id,admission_no' })
      .select('id, admission_no')
    if (error) { errors.push(`students chunk ${i / CHUNK + 1}: ${error.message}`); continue }
    studentsUpserted += (up ?? []).length
    for (const s of (up ?? []) as { id: string; admission_no: string }[]) admToId.set(s.admission_no, s.id)
  }

  // 3. Parent↔student links (authoritative, school-scoped) from all parent phones on each row.
  let linksSeeded = 0
  if (seedLinks) {
    const links: any[] = []
    for (const r of rows) {
      const sid = admToId.get(r.admission_no.trim().toUpperCase())
      if (!sid) continue
      const phones = [...new Set([normPhone(r.parent_phone), normPhone(r.parent2_phone), normPhone(r.guardian_phone)].filter(Boolean) as string[])]
      phones.forEach((phone, idx) => links.push({ school_id, parent_id: phone, student_id: sid, relationship: 'guardian', is_primary: idx === 0, is_active: true, verified: true }))
    }
    if (links.length) {
      const { error } = await db.from('parent_student_links').upsert(links, { onConflict: 'parent_id,student_id' })
      if (error) errors.push(`links: ${error.message}`); else linksSeeded = links.length
    }
  }

  // 4. Optional biometric enrollments (device_user_id -> student) when the row carries them.
  let enrollments = 0
  const enr = rows
    .filter((r) => r.device_serial && r.device_user_id)
    .map((r) => ({
      school_id, device_serial: r.device_serial!.trim(), device_user_id: String(r.device_user_id).trim(),
      subject_type: 'student', student_id: admToId.get(r.admission_no.trim().toUpperCase()) ?? null,
    }))
    .filter((e) => e.student_id)
  if (enr.length) {
    const { error } = await db.from('biometric_enrollments').upsert(enr, { onConflict: 'device_serial,device_user_id' })
    if (error) errors.push(`enrollments: ${error.message}`); else enrollments = enr.length
  }

  return NextResponse.json({ ok: errors.length === 0, studentsUpserted, classesEnsured: classNames.length, linksSeeded, enrollments, errors })
}
