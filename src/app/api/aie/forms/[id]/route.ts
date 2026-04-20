// GET   /api/aie/forms/[id] — fetch full AIE form detail
// PATCH /api/aie/forms/[id] — update status (approve/fulfill/receive/close/reject)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  const { id } = await params

  const db = svc()
  const { data, error } = await db
    .from('aie_forms')
    .select('*')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  const { id } = await params

  const db   = svc()
  const body = await req.json() as { status: string; notes?: string }

  const VALID_TRANSITIONS: Record<string, string[]> = {
    pending:   ['approved', 'rejected'],
    approved:  ['fulfilled', 'rejected'],
    fulfilled: ['received'],
    received:  ['closed'],
  }

  const { data: form } = await db
    .from('aie_forms')
    .select('status, created_by')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

  type FormRow = { status: string; created_by: string }
  const f = form as FormRow

  const allowed = VALID_TRANSITIONS[f.status] ?? []
  if (!allowed.includes(body.status)) {
    return NextResponse.json({
      error: `Cannot transition from '${f.status}' to '${body.status}'`,
    }, { status: 409 })
  }

  // Only principal can approve/reject; storekeeper can fulfill; requestor can mark received
  const { data: staff } = await db
    .from('staff_records').select('id, sub_role').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  type StaffRow = { id: string; sub_role: string }
  const s = staff as StaffRow

  if (['approved', 'rejected'].includes(body.status) && s.sub_role !== 'principal') {
    return NextResponse.json({ error: 'Only principal can approve or reject AIE forms' }, { status: 403 })
  }
  if (body.status === 'fulfilled' && !['storekeeper', 'principal'].includes(s.sub_role)) {
    return NextResponse.json({ error: 'Only storekeeper can mark as fulfilled' }, { status: 403 })
  }

  const now = new Date().toISOString()
  const updates: Record<string, unknown> = { status: body.status }
  if (body.notes) updates.notes = body.notes
  if (body.status === 'approved')   { updates.approved_by = s.id; updates.approved_at = now }
  if (body.status === 'fulfilled')  updates.fulfilled_at = now
  if (body.status === 'received')   updates.received_at = now
  if (body.status === 'closed')     updates.closed_at = now

  const { error } = await db.from('aie_forms').update(updates).eq('id', id).eq('school_id', auth.schoolId!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: body.status })
}
