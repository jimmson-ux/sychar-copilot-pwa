import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { genTempPassword } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

/**
 * /api/admin/staff — fluid staff management (principal / deputy / super_admin).
 *   POST  onboard one teacher (mints a login, inserts staff_records).
 *   PATCH { id, action:'deactivate'|'update', ... }
 *         deactivate = OFFBOARD: is_active=false + exit_date + exit_reason (NEVER deleted;
 *         history kept). Optional replaced_by hands the outgoing teacher's class to the incoming.
 * Every action is written to user_admin_audit.
 */
const MANAGE = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin'])

async function actor(svc: ReturnType<typeof createAdminSupabaseClient>, userId: string) {
  const { data } = await svc.from('staff_records').select('id').eq('user_id', userId).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const { data } = await svc.from('staff_records')
    .select('id, full_name, sub_role, phone, email, department, is_active, exit_date, exit_reason, assigned_class_name')
    .eq('school_id', auth.schoolId).order('is_active', { ascending: false }).order('full_name').limit(400)
  return NextResponse.json({ staff: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, any>
  if (!b.full_name?.trim() || !b.sub_role?.trim()) return NextResponse.json({ error: 'full_name and sub_role required' }, { status: 400 })

  const svc = createAdminSupabaseClient()
  const performedBy = await actor(svc, auth.userId)
  const wantsLogin = b.can_login !== false
  let userId: string | null = null
  let tempPassword: string | null = null
  let email: string | null = b.email?.trim()?.toLowerCase() ?? null

  if (wantsLogin) {
    if (!email) {
      const parts = b.full_name.trim().toLowerCase().split(/\s+/)
      email = `${parts[0]}.${parts[parts.length - 1] ?? 'staff'}`.replace(/[^a-z0-9.]/g, '') + '@' + (b.email_domain ?? 'sychar.co.ke')
    }
    tempPassword = genTempPassword(b.full_name)
    const { data: created, error: ce } = await svc.auth.admin.createUser({ email, password: tempPassword, email_confirm: true, user_metadata: { full_name: b.full_name } })
    if (ce || !created?.user) return NextResponse.json({ error: ce?.message ?? 'Failed to create login' }, { status: 422 })
    userId = created.user.id
  }

  const { data, error } = await svc.from('staff_records').insert({
    school_id: auth.schoolId, user_id: userId, full_name: b.full_name.trim(), sub_role: b.sub_role,
    phone: b.phone ?? null, email, department: b.department ?? null,
    departments: b.department ? [b.department] : [], subject_specialization: b.subjects ?? [],
    teacher_subjects: b.subjects ?? [], assigned_class: b.assigned_class ?? null,
    assigned_class_name: b.assigned_class ?? null, tsc_number: b.tsc_number ?? null,
    national_id: b.national_id ?? null, employment_type: b.employment_type ?? 'tsc',
    is_active: true, can_login: wantsLogin, force_password_change: wantsLogin, push_recipient: b.push_recipient ?? true,
  }).select('id').single()
  if (error) { if (userId) await svc.auth.admin.deleteUser(userId).catch(() => {}); return NextResponse.json({ error: 'Failed to create staff' }, { status: 500 }) }

  const staffId = (data as { id: string }).id
  void svc.from('user_admin_audit').insert({ school_id: auth.schoolId, target_staff_id: staffId, performed_by: performedBy, action: 'onboard_staff', after_state: { full_name: b.full_name, sub_role: b.sub_role }, reason: b.reason ?? null })
  return NextResponse.json({ ok: true, id: staffId, login: wantsLogin ? { email, temp_password: tempPassword } : null })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, any>
  if (!b.id || !['deactivate', 'update'].includes(b.action)) return NextResponse.json({ error: 'id and valid action required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const performedBy = await actor(svc, auth.userId)

  const { data: cur } = await svc.from('staff_records').select('id, full_name, sub_role, is_active, assigned_class_name').eq('id', b.id).eq('school_id', auth.schoolId).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  const c = cur as { id: string; full_name: string; sub_role: string; is_active: boolean; assigned_class_name: string | null }

  if (b.action === 'deactivate') {
    // OFFBOARD — never delete. Keep the row + history; flag inactive with reason.
    await svc.from('staff_records').update({
      is_active: false, exit_date: b.exit_date ?? new Date().toISOString().slice(0, 10),
      exit_reason: b.exit_reason ?? null, can_login: false,
      replaced_by: b.replaced_by ?? null,
    }).eq('id', c.id).eq('school_id', auth.schoolId)
    // Hand the outgoing teacher's class to the incoming staff, if provided.
    if (b.replaced_by && c.assigned_class_name) {
      await svc.from('staff_records').update({ assigned_class: c.assigned_class_name, assigned_class_name: c.assigned_class_name }).eq('id', b.replaced_by).eq('school_id', auth.schoolId)
    }
    void svc.from('user_admin_audit').insert({ school_id: auth.schoolId, target_staff_id: c.id, performed_by: performedBy, action: 'offboard_staff', before_state: { is_active: true }, after_state: { is_active: false, exit_reason: b.exit_reason ?? null, replaced_by: b.replaced_by ?? null }, reason: b.exit_reason ?? null })
    return NextResponse.json({ ok: true, offboarded: c.id, history_retained: true })
  }

  // update — patch allowed fields only.
  const patch: Record<string, unknown> = {}
  for (const k of ['phone', 'department', 'sub_role', 'assigned_class', 'assigned_class_name', 'push_recipient', 'is_active']) if (b[k] !== undefined) patch[k] = b[k]
  if (b.subjects !== undefined) { patch.subject_specialization = b.subjects; patch.teacher_subjects = b.subjects }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  await svc.from('staff_records').update(patch).eq('id', c.id).eq('school_id', auth.schoolId)
  void svc.from('user_admin_audit').insert({ school_id: auth.schoolId, target_staff_id: c.id, performed_by: performedBy, action: 'update_staff', after_state: patch })
  return NextResponse.json({ ok: true, updated: c.id })
}
