import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { deputyConfigFromFeatures, adminEscalation } from '@sychar/core'

export const dynamic = 'force-dynamic'

/**
 * /api/incidents — staff incident reporting, shared to the Principal + Deputies in
 * real time (all schools). GET list; POST create (→ web push to leadership); PATCH resolve.
 */
const RESOLVE = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_students', 'secretary'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('incident_reports')
    .select('id, incident_type, description, location, severity, status, students_involved, action_taken, occurred_at, created_at')
    .eq('school_id', auth.schoolId).order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ incidents: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  if (!b.incident_type || !String(b.description ?? '').trim()) {
    return NextResponse.json({ error: 'incident_type and description required' }, { status: 400 })
  }
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id, full_name').eq('user_id', auth.userId).maybeSingle()
  const { data, error } = await svc.from('incident_reports').insert({
    school_id: auth.schoolId, reported_by: (me as { id: string } | null)?.id ?? null,
    incident_type: String(b.incident_type), description: String(b.description).trim(),
    location: b.location ?? null, severity: ['low', 'medium', 'high', 'critical'].includes(String(b.severity)) ? b.severity : 'medium',
    students_involved: Array.isArray(b.students_involved) ? b.students_involved : [],
    occurred_at: b.occurred_at ?? new Date().toISOString(),
  }).select('id, severity').single()
  if (error) return NextResponse.json({ error: 'Failed to file incident' }, { status: 500 })

  // Real-time alert to principal + admin deputies (mapped per school).
  const { data: tc } = await svc.from('tenant_configs').select('features').eq('school_id', auth.schoolId).maybeSingle()
  const targets = adminEscalation(deputyConfigFromFeatures((tc as { features?: Record<string, unknown> } | null)?.features))
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ audience: 'role', value: targets, school_id: auth.schoolId, payload: {
      title: `Incident reported: ${String(b.incident_type).replace(/_/g, ' ')}`,
      body: String(b.description).trim().slice(0, 140), url: '/dashboard', tag: 'incident', renotify: true,
    } }),
  }).catch(() => {})
  return NextResponse.json({ ok: true, id: (data as { id: string }).id, notified: targets })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!RESOLVE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; status?: string; action_taken?: string }
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const svc = createAdminSupabaseClient()
  const patch: Record<string, unknown> = {}
  if (b.status && ['open', 'investigating', 'resolved'].includes(b.status)) {
    patch.status = b.status
    if (b.status === 'resolved') patch.resolved_at = new Date().toISOString()
  }
  if (b.action_taken !== undefined) patch.action_taken = b.action_taken
  const { error } = await svc.from('incident_reports').update(patch).eq('id', b.id).eq('school_id', auth.schoolId)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
