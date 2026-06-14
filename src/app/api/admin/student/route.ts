import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/admin/student — fluid student management (principal / deputy / secretary / super_admin).
 *   POST  onboard one student.
 *   PATCH { id, action:'archive'|'update', status?, exit_reason? }
 *         archive = is_active=false + status(transferred|graduated|withdrawn|archived) +
 *         archived_at + exit_reason. NEVER hard-deleted — academic/fee/discipline history stays.
 */
const MANAGE = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'secretary'])
const EXIT = new Set(['transferred', 'graduated', 'withdrawn', 'archived', 'suspended'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, any>
  if (!b.full_name?.trim() || !b.class_name?.trim()) return NextResponse.json({ error: 'full_name and class_name required' }, { status: 400 })
  const svc = createAdminSupabaseClient()

  // Resolve class_id if the class exists (best-effort).
  const { data: cls } = await svc.from('classes').select('id').eq('school_id', auth.schoolId).eq('name', b.class_name.trim()).maybeSingle()

  const { data, error } = await svc.from('students').insert({
    school_id: auth.schoolId, full_name: b.full_name.trim(),
    admission_no: b.admission_no ?? null, admission_number: b.admission_no ?? null,
    class_name: b.class_name.trim(), class_id: (cls as { id: string } | null)?.id ?? null,
    gender: b.gender ?? null, form: b.form ?? null, grade: b.grade ?? null,
    is_active: true, status: 'active', is_in_school: false,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed to onboard student' }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, any>
  if (!b.id || !['archive', 'update'].includes(b.action)) return NextResponse.json({ error: 'id and valid action required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const { data: cur } = await svc.from('students').select('id').eq('id', b.id).eq('school_id', auth.schoolId).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  if (b.action === 'archive') {
    const status = EXIT.has(b.status) ? b.status : 'archived'
    await svc.from('students').update({
      is_active: false, status, archived_at: new Date().toISOString(), exit_reason: b.exit_reason ?? null,
    }).eq('id', b.id).eq('school_id', auth.schoolId)
    return NextResponse.json({ ok: true, archived: b.id, status, history_retained: true })
  }

  const patch: Record<string, unknown> = {}
  for (const k of ['full_name', 'class_name', 'gender', 'form', 'grade', 'admission_no']) if (b[k] !== undefined) patch[k] = b[k]
  if (b.class_name !== undefined) {
    const { data: cls } = await svc.from('classes').select('id').eq('school_id', auth.schoolId).eq('name', b.class_name).maybeSingle()
    if (cls) patch.class_id = (cls as { id: string }).id
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  await svc.from('students').update(patch).eq('id', b.id).eq('school_id', auth.schoolId)
  return NextResponse.json({ ok: true, updated: b.id })
}
