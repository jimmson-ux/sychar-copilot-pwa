// POST /api/requisitions/[id]/issue
// Storekeeper or principal issues items against an approved aie_form.
// Body: { items: [{ item_id, issued_to_name, quantity_issued, notes? }] }

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_ROLES = ['storekeeper', 'principal', 'deputy_principal_admin']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!ALLOWED_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Only storekeeper or principal can issue items' }, { status: 403 })
  }

  const { id: aieFormId } = await params
  const body = await req.json().catch(() => ({}))
  const { items } = body as {
    items?: Array<{ item_id: string; issued_to_name: string; quantity_issued: number; notes?: string }>
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items[] is required' }, { status: 400 })
  }

  const db = serviceClient()

  // Verify the aie_form belongs to this school and is approved
  const { data: form } = await db
    .from('aie_forms')
    .select('id, status, school_id')
    .eq('id', aieFormId)
    .eq('school_id', schoolId)
    .single()

  if (!form) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }
  if (!['approved', 'partially_fulfilled'].includes(form.status)) {
    return NextResponse.json({ error: 'Requisition must be approved before issuing items' }, { status: 400 })
  }

  // Insert all issuances
  const issuances = items.map(item => ({
    school_id:      schoolId,
    item_id:        item.item_id,
    issued_to_name: item.issued_to_name,
    quantity_issued: item.quantity_issued,
    issued_by:      userId,
    notes:          item.notes ?? null,
  }))

  const { error: insertErr } = await db
    .from('requisition_item_issuances')
    .insert(issuances)

  if (insertErr) {
    console.error('[issue] insert error:', insertErr.message)
    return NextResponse.json({ error: 'Failed to record issuances' }, { status: 500 })
  }

  // Return updated items for this form
  const { data: updatedItems } = await db
    .from('requisition_items')
    .select('*')
    .eq('aie_form_id', aieFormId)
    .order('created_at')

  return NextResponse.json({ ok: true, items: updatedItems ?? [] })
}
