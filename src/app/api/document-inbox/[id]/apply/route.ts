// POST /api/document-inbox/[id]/apply
// Principal ONLY — explicitly applies approved changes from a ministry circular.
// NEVER auto-applied. Principal must review and confirm each change.
// Logs every applied change to system_logs.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type ApprovedChange = {
  type: 'vote_head_rate' | 'policy' | 'deadline' | 'academic_term'
  field: string
  value: string | number
}

type CircularRow = {
  id: string
  status: string
  gemini_extracted: {
    vote_head_changes?: Array<{ head: string; old_rate: number; new_rate: number }>
    policy_changes?: Array<{ policy: string; old_value: string; new_value: string }>
    deadlines?: Array<{ item: string; date: string }>
  } | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null) as {
    approvedChanges: ApprovedChange[]
  } | null

  if (!body?.approvedChanges?.length) {
    return NextResponse.json({ error: 'approvedChanges array required' }, { status: 400 })
  }

  const db = svc()

  const { data: circular, error: fetchErr } = await db
    .from('ministry_circulars')
    .select('id, status, gemini_extracted')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !circular) {
    return NextResponse.json({ error: 'Circular not found' }, { status: 404 })
  }

  const c = circular as CircularRow

  if (c.status === 'applied') {
    return NextResponse.json({ error: 'Circular has already been applied' }, { status: 409 })
  }

  const appliedLog: { type: string; field: string; value: string | number; applied_at: string }[] = []
  const errors: string[] = []
  const now = new Date().toISOString()

  for (const change of body.approvedChanges) {
    try {
      if (change.type === 'vote_head_rate') {
        // Update tenant_configs.settings with new FDSE rate
        const { data: tenant } = await db
          .from('tenant_configs')
          .select('settings')
          .eq('school_id', auth.schoolId!)
          .single()

        type TenantRow = { settings: Record<string, unknown> }
        const t = tenant as TenantRow | null
        const settings = { ...(t?.settings ?? {}), [change.field]: change.value }

        await db.from('tenant_configs')
          .update({ settings })
          .eq('school_id', auth.schoolId!)

        appliedLog.push({ type: change.type, field: change.field, value: change.value, applied_at: now })
      } else if (change.type === 'policy') {
        // Update school_rules table or tenant_configs.settings
        const { data: tenant } = await db
          .from('tenant_configs')
          .select('settings')
          .eq('school_id', auth.schoolId!)
          .single()

        type TenantRow = { settings: Record<string, unknown> }
        const t = tenant as TenantRow | null
        const settings = { ...(t?.settings ?? {}), [`policy_${change.field}`]: change.value }

        await db.from('tenant_configs')
          .update({ settings })
          .eq('school_id', auth.schoolId!)

        appliedLog.push({ type: change.type, field: change.field, value: change.value, applied_at: now })
      } else if (change.type === 'academic_term') {
        await db.from('academic_terms')
          .update({ [change.field]: change.value })
          .eq('school_id', auth.schoolId!)
          .eq('is_current', true)

        appliedLog.push({ type: change.type, field: change.field, value: change.value, applied_at: now })
      } else if (change.type === 'deadline') {
        // Record deadline as a notice to the school
        await db.from('notices').insert({
          school_id:       auth.schoolId,
          title:           `Ministry Deadline: ${change.field}`,
          content:         `Deadline set by ministry circular: ${change.field} — due ${change.value}`,
          target_audience: 'principal',
          created_at:      now,
        })
        appliedLog.push({ type: change.type, field: change.field, value: change.value, applied_at: now })
      }
    } catch (e) {
      console.error('[document-inbox/apply] change error:', change, e)
      errors.push(`Failed to apply change: ${change.type} / ${change.field}`)
    }
  }

  // Persist each change to system_logs
  if (appliedLog.length > 0) {
    await db.from('system_logs').insert(
      appliedLog.map(log => ({
        school_id:   auth.schoolId,
        actor_id:    auth.userId,
        action:      `ministry_circular_apply:${log.type}`,
        entity_type: 'ministry_circular',
        entity_id:   id,
        metadata:    log,
        created_at:  now,
      }))
    ).then(() => {}, e => console.error('[document-inbox/apply] log error:', e))
  }

  // Mark circular as applied
  await db.from('ministry_circulars').update({
    status:     'applied',
    applied_by: auth.userId,
    applied_at: now,
  }).eq('id', id).eq('school_id', auth.schoolId!)

  return NextResponse.json({
    ok: true,
    appliedCount: appliedLog.length,
    errorCount:   errors.length,
    applied:      appliedLog,
    errors:       errors.length > 0 ? errors : undefined,
  })
}
