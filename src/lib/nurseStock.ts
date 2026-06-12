// Shared nurse medication-stock helpers. Student AND staff visits deduct from the
// SAME nurse_medications stock so reconciliation is unified.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MedItem { medication_id?: string; name?: string; quantity?: number; dosage?: string; notes?: string }

/** Compute the follow-up due timestamp from a nurse follow-up plan label. */
export function followupDueFromPlan(plan?: string | null): string | null {
  if (!plan) return null
  const day = 86400000
  const map: Record<string, number> = {
    'Review in 24 Hours': 1 * day,
    'Review in 3 Days': 3 * day,
    'Review in 1 Week': 7 * day,
    'Ongoing Monitoring': 1 * day,
  }
  const delta = map[plan]
  return delta ? new Date(Date.now() + delta).toISOString() : null
}

/** Resolve a medication row by id or (school, name); create a zero-stock row if missing. */
async function resolveMedication(svc: SupabaseClient, schoolId: string, item: MedItem): Promise<{ id: string } | null> {
  if (item.medication_id) {
    const { data } = await svc.from('nurse_medications').select('id').eq('id', item.medication_id).eq('school_id', schoolId).maybeSingle()
    if (data) return data as { id: string }
  }
  if (item.name?.trim()) {
    const { data } = await svc.from('nurse_medications').select('id').eq('school_id', schoolId).ilike('name', item.name.trim()).maybeSingle()
    if (data) return data as { id: string }
    const { data: created } = await svc.from('nurse_medications')
      .insert({ school_id: schoolId, name: item.name.trim(), stock_qty: 0 })
      .select('id').single()
    return (created as { id: string } | null) ?? null
  }
  return null
}

/**
 * Deduct issued medications from stock and log movements. Returns issued count.
 * patientKind links the movement to a student or staff visit for reconciliation.
 */
export async function recordMedicationIssue(
  svc: SupabaseClient,
  schoolId: string,
  items: MedItem[],
  patientKind: 'student' | 'staff',
  visitId: string | null,
  createdBy: string | null,
): Promise<number> {
  let issued = 0
  for (const item of items ?? []) {
    const qty = Number(item.quantity) || 0
    if (qty <= 0) continue
    const med = await resolveMedication(svc, schoolId, item)
    if (!med) continue

    // Atomic-ish decrement (read then write — nurse single-user flow, low contention).
    const { data: cur } = await svc.from('nurse_medications').select('stock_qty').eq('id', med.id).single()
    const newQty = Number((cur as { stock_qty: number } | null)?.stock_qty ?? 0) - qty
    await svc.from('nurse_medications').update({ stock_qty: newQty, updated_at: new Date().toISOString() }).eq('id', med.id)

    await svc.from('nurse_stock_movements').insert({
      school_id: schoolId, medication_id: med.id, change_qty: -qty,
      reason: 'issue', patient_kind: patientKind, visit_id: visitId, created_by: createdBy,
    })
    issued++
  }
  return issued
}
