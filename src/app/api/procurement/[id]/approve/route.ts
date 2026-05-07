// PATCH /api/procurement/[id]/approve — principal approves or rejects delivery
// On approval: trigger fires → inventory updated, price history written

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden — principal only' }, { status: 403 })
  }

  const { id }   = await params
  const body     = await req.json().catch(() => ({})) as { action?: 'approve' | 'reject'; notes?: string }

  if (body.action !== 'approve' && body.action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: doc } = await db
    .from('procurement_documents')
    .select('id, workflow_status, uploaded_by, supplier_name')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const d = doc as { id: string; workflow_status: string; uploaded_by: string; supplier_name: string | null }

  if (d.workflow_status === 'approved') {
    return NextResponse.json({ error: 'Already approved' }, { status: 409 })
  }

  const { data: principal } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  const p = principal as { id: string; full_name: string } | null

  if (body.action === 'approve') {
    const { error: updErr } = await db
      .from('procurement_documents')
      .update({
        workflow_status: 'approved',
        approved_by:     p?.id ?? null,
        approved_at:     new Date().toISOString(),
        approval_notes:  body.notes ?? null,
      })
      .eq('id', id)

    if (updErr) {
      console.error('[procurement/approve] update error:', updErr.message)
      return NextResponse.json({ error: 'Approval failed' }, { status: 500 })
    }

    // Count items that will be updated by the DB trigger
    const { count } = await db
      .from('procurement_line_items')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', id)
      .not('quantity_received', 'is', null)
      .gt('quantity_received', 0)
      .in('condition', ['good', 'damaged'])
      .eq('inventory_updated', false)

    // Notify storekeeper + bursar
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'procurement',
      severity:  'info',
      title:     `✅ Delivery approved by ${p?.full_name ?? 'Principal'}`,
      detail:    { document_id: id, approved_by: p?.full_name, items_count: count },
    }).then(() => {}, () => {})

    return NextResponse.json({ approved: true, inventoryItemsUpdated: count ?? 0 })
  }

  // Reject
  await db.from('procurement_documents').update({
    workflow_status:  'rejected',
    approved_by:      p?.id ?? null,
    approved_at:      new Date().toISOString(),
    rejection_reason: body.notes ?? 'Rejected by principal',
  }).eq('id', id)

  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'procurement',
    severity:  'warning',
    title:     `❌ Delivery rejected by ${p?.full_name ?? 'Principal'}`,
    detail:    { document_id: id, reason: body.notes },
  }).then(() => {}, () => {})

  return NextResponse.json({ approved: false, reason: body.notes ?? null })
}
