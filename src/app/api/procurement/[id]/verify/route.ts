// PATCH /api/procurement/[id]/verify — storekeeper confirms physical delivery quantities

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

interface LineVerification {
  id: string
  quantityReceived: number
  condition: 'good' | 'damaged' | 'wrong_item' | 'short_delivery' | 'not_delivered'
  storekeeperNote?: string
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'storekeeper') {
    return NextResponse.json({ error: 'Forbidden — storekeeper only' }, { status: 403 })
  }

  const { id } = await params
  const body   = await req.json().catch(() => ({})) as { lineItems?: LineVerification[]; notes?: string }

  if (!Array.isArray(body.lineItems) || body.lineItems.length === 0) {
    return NextResponse.json({ error: 'lineItems array required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: doc } = await db
    .from('procurement_documents')
    .select('id, workflow_status, uploaded_by, school_id')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  if ((doc as { workflow_status: string }).workflow_status === 'approved') {
    return NextResponse.json({ error: 'Document already approved' }, { status: 409 })
  }

  const { data: storekeeperId } = await db
    .from('staff_records')
    .select('id, full_name')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  // Update each line item
  const updateResults = await Promise.allSettled(
    body.lineItems.map(item =>
      db.from('procurement_line_items')
        .update({
          quantity_received: item.quantityReceived,
          condition:         item.condition,
          storekeeper_note:  item.storekeeperNote ?? null,
        })
        .eq('id', item.id)
        .eq('document_id', id)
    )
  )

  const failed = updateResults.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error('[procurement/verify] some line item updates failed:', failed.length)
  }

  // Re-fetch line items to detect discrepancies
  const { data: items } = await db
    .from('procurement_line_items')
    .select('id, quantity_invoiced, quantity_received, condition, item_name')
    .eq('document_id', id)

  const discrepancies = (items ?? []).filter(item => {
    const inv = Number((item as { quantity_invoiced: number }).quantity_invoiced)
    const rec = Number((item as { quantity_received: number | null }).quantity_received ?? 0)
    return Math.abs(rec - inv) / inv > 0.1  // >10% variance = discrepancy
  })

  const newStatus = discrepancies.length > 0 ? 'discrepancy_raised' : 'storekeeper_verified'

  const sk = storekeeperId as { id: string; full_name: string } | null

  await db.from('procurement_documents').update({
    workflow_status:    newStatus,
    verified_by:        sk?.id ?? null,
    verified_at:        new Date().toISOString(),
    verification_notes: body.notes ?? null,
  }).eq('id', id)

  // Notify principal about new pending approval
  const alertTitle = discrepancies.length > 0
    ? `⚠️ Delivery Verified with Discrepancies — ${discrepancies.length} item(s) short`
    : `✅ Delivery Verified — Awaiting Your Approval`

  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'procurement',
    severity:  discrepancies.length > 0 ? 'warning' : 'info',
    title:     alertTitle,
    detail:    {
      document_id:     id,
      verified_by:     sk?.full_name ?? 'Storekeeper',
      discrepancy_count: discrepancies.length,
      discrepancies:   discrepancies.map(d => (d as { item_name: string }).item_name),
    },
  }).then(() => {}, () => {})

  return NextResponse.json({
    status:       newStatus,
    discrepancies: discrepancies.map(d => ({
      itemName:          (d as { item_name: string }).item_name,
      invoiced:          (d as { quantity_invoiced: number }).quantity_invoiced,
      received:          (d as { quantity_received: number | null }).quantity_received,
    })),
    itemsVerified: body.lineItems.length,
  })
}
