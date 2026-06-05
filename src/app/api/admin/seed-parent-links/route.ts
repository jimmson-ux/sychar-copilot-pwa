// Admin: seed parent_student_links (authoritative parent↔student ownership).
//   GET  -> current link count for the school
//   POST { action: 'seed_from_students' }        -> derive links from students.parent_phone / parent2_phone
//   POST { action: 'seed_rows', rows: [{ admission_no?|student_id?, parent_phone, relationship?, is_primary? }] }
// All links are school-scoped + verified, so the wazazi parent PWA isolates each
// parent to their own children within THIS school (Nkoroi & Oloolaiser stay separate).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const ADMIN_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'super_admin'])

type Link = { school_id: string; parent_id: string; student_id: string; relationship: string; is_primary: boolean; is_active: boolean; verified: boolean }

function normPhone(p: string | null | undefined): string | null {
  if (!p) return null
  const t = String(p).trim().replace(/\s+/g, '')
  return t ? t.replace(/^\+?254/, '0') : null  // normalise to local 0… form
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = svc()
  const { count } = await db.from('parent_student_links').select('*', { count: 'exact', head: true }).eq('school_id', auth.schoolId!)
  return NextResponse.json({ links: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ADMIN_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null) as any
  const school_id = auth.schoolId!
  const db = svc()
  const links: Link[] = []

  if (body?.action === 'seed_from_students') {
    // Auto-derive from the uploaded roster: each student's parent_phone (+ parent2_phone).
    const { data: studs } = await db.from('students')
      .select('id, parent_phone, parent2_phone').eq('school_id', school_id).eq('is_active', true)
    for (const s of (studs ?? []) as any[]) {
      const p1 = normPhone(s.parent_phone)
      const p2 = normPhone(s.parent2_phone)
      if (p1) links.push({ school_id, parent_id: p1, student_id: s.id, relationship: 'guardian', is_primary: true, is_active: true, verified: true })
      if (p2 && p2 !== p1) links.push({ school_id, parent_id: p2, student_id: s.id, relationship: 'guardian', is_primary: false, is_active: true, verified: true })
    }
  } else if (body?.action === 'seed_rows' && Array.isArray(body.rows)) {
    // Resolve student_id by admission_no when not supplied.
    const byAdm = body.rows.filter((r: any) => !r.student_id && r.admission_no).map((r: any) => String(r.admission_no))
    const admMap = new Map<string, string>()
    if (byAdm.length) {
      const { data: found } = await db.from('students')
        .select('id, admission_no, admission_number').eq('school_id', school_id)
        .or(`admission_no.in.(${byAdm.join(',')}),admission_number.in.(${byAdm.join(',')})`)
      for (const s of (found ?? []) as any[]) {
        if (s.admission_no) admMap.set(String(s.admission_no), s.id)
        if (s.admission_number) admMap.set(String(s.admission_number), s.id)
      }
    }
    for (const r of body.rows as any[]) {
      const phone = normPhone(r.parent_phone)
      const sid = r.student_id ?? (r.admission_no ? admMap.get(String(r.admission_no)) : null)
      if (phone && sid) links.push({ school_id, parent_id: phone, student_id: sid, relationship: r.relationship ?? 'guardian', is_primary: r.is_primary ?? true, is_active: true, verified: true })
    }
  } else {
    return NextResponse.json({ error: "action must be 'seed_from_students' or 'seed_rows'" }, { status: 400 })
  }

  if (!links.length) return NextResponse.json({ ok: true, seeded: 0, note: 'no resolvable parent phones' })

  const { error } = await db.from('parent_student_links').upsert(links, { onConflict: 'parent_id,student_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, seeded: links.length })
}
