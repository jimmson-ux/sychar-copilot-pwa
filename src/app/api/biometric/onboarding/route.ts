// GET /api/biometric/onboarding — fingerprint enrollment progress (Oloolaiser).
// Pending-enrollment report: active students NOT yet biometric_ready, grouped by class,
// so the ICT/boarding team knows exactly who still needs to be captured on the devices.
// PATCH { student_ids:[], ready:bool } — mark students enrolled/cleared (the gateway's
// onboarding-manager also flips biometric_ready by diffing device users vs students).
// Leadership / ICT. Feature: biometric_gate.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const MANAGE = new Set(['principal', 'deputy_principal', 'deputy_principal_admin', 'ict', 'ict_admin', 'secretary'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!await tenantHasFeature(auth.schoolId!, 'biometric_gate')) {
    return NextResponse.json({ error: 'biometric_gate feature not enabled' }, { status: 403 })
  }

  const db = svc()
  const schoolId = auth.schoolId!

  const { count: total } = await db.from('students').select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId).eq('is_active', true)
  const { count: ready } = await db.from('students').select('id', { count: 'exact', head: true })
    .eq('school_id', schoolId).eq('is_active', true).eq('biometric_ready', true)

  const { data: pending } = await db.from('students')
    .select('id, full_name, class_name, admission_no')
    .eq('school_id', schoolId).eq('is_active', true).eq('biometric_ready', false)
    .order('class_name').order('full_name').limit(2000)

  const byClass: Record<string, { id: string; full_name: string; admission_no: string | null }[]> = {}
  for (const s of (pending ?? []) as any[]) {
    (byClass[s.class_name ?? 'Unassigned'] ??= []).push({ id: s.id, full_name: s.full_name, admission_no: s.admission_no })
  }

  return NextResponse.json({
    ok: true,
    total_active: total ?? 0,
    enrolled: ready ?? 0,
    pending_count: pending?.length ?? 0,
    percent_ready: total ? Math.round(((ready ?? 0) / total) * 100) : 0,
    pending_by_class: byClass,
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!MANAGE.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json().catch(() => ({})) as { student_ids?: string[]; ready?: boolean }
  if (!Array.isArray(b.student_ids) || !b.student_ids.length) {
    return NextResponse.json({ error: 'student_ids[] required' }, { status: 400 })
  }
  const db = svc()
  await db.from('students').update({ biometric_ready: b.ready !== false })
    .eq('school_id', auth.schoolId!).in('id', b.student_ids)
  return NextResponse.json({ ok: true, updated: b.student_ids.length, ready: b.ready !== false })
}
