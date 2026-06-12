import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { recordMedicationIssue, followupDueFromPlan, type MedItem } from '@/lib/nurseStock'

export const dynamic = 'force-dynamic'

/**
 * /api/nurse/staff-visits — CONFIDENTIAL staff patient ledger (teaching + non-teaching).
 * Nurse-only. The principal can never see staff patients by name (see nurse_staff_summary).
 *
 *   GET  → recent staff visits (nurse only)
 *   POST → log a staff visit; medication_items deduct shared stock; confirming
 *          medication issuance sets medication_issued_at = end of visit.
 */
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'nurse') {
    return NextResponse.json({ error: 'Forbidden: confidential staff ledger (nurse only)' }, { status: 403 })
  }
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc
    .from('staff_patient_visits')
    .select('id, patient_staff_id, staff_type, complaint, action_taken, visit_started_at, medication_issued_at, follow_up_plan, staff_records:patient_staff_id(full_name)')
    .eq('school_id', auth.schoolId)
    .order('visit_started_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  return NextResponse.json({ visits: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'nurse') {
    return NextResponse.json({ error: 'Forbidden: nurse only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    patient_staff_id?: string; staff_type?: string; complaint?: string; action_taken?: string
    notes?: string; vitals?: Record<string, unknown>; nurse_findings?: string
    management_provided?: string[]; medication_items?: MedItem[]; referral_to?: string; follow_up_plan?: string
  }
  if (!body.complaint?.trim() || !body.action_taken?.trim()) {
    return NextResponse.json({ error: 'complaint and action_taken required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()
  const { data: nurse } = await svc.from('staff_records').select('id').eq('user_id', auth.userId).single()
  const meds = body.medication_items ?? []
  const issuedMedication = meds.length > 0 || body.action_taken === 'Medication Administered'
  const now = new Date().toISOString()

  const { data: visit, error } = await svc
    .from('staff_patient_visits')
    .insert({
      school_id: auth.schoolId,
      patient_staff_id: body.patient_staff_id ?? null,
      staff_type: body.staff_type === 'non_teaching' ? 'non_teaching' : 'teaching',
      complaint: body.complaint.trim(),
      action_taken: body.action_taken.trim(),
      notes: body.notes ?? null,
      vitals: body.vitals ?? {},
      nurse_findings: body.nurse_findings ?? null,
      management_provided: body.management_provided ?? [],
      medication_items: meds,
      referral_to: body.referral_to ?? null,
      follow_up_plan: body.follow_up_plan ?? null,
      seen_by: (nurse as { id: string } | null)?.id ?? null,
      medication_issued_at: issuedMedication ? now : null,
      followup_due_at: followupDueFromPlan(body.follow_up_plan),
    })
    .select('id')
    .single()

  if (error) {
    console.error('[nurse/staff-visits]', error)
    return NextResponse.json({ error: 'Failed to log visit' }, { status: 500 })
  }

  const visitId = (visit as { id: string }).id
  let issued = 0
  if (meds.length) {
    issued = await recordMedicationIssue(svc, auth.schoolId, meds, 'staff', visitId, (nurse as { id: string } | null)?.id ?? null)
  }

  return NextResponse.json({ ok: true, visit_id: visitId, medications_issued: issued, visit_ended: issuedMedication })
}
