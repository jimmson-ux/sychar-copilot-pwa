// PATCH /api/requisitions/[id]/approve
// Principal ONLY — approve or reject an AIE requisition.
// On approval, notifies the requester via send-sms edge function.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function PATCH(
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
    action: 'approve' | 'reject'
    reason?: string
  } | null

  if (!body?.action || !['approve', 'reject'].includes(body.action)) {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const db = svc()

  const { data: form, error: fetchErr } = await db
    .from('aie_forms')
    .select('id, status, requested_by, department, total_amount, created_by')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !form) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }

  type FormRow = { id: string; status: string; requested_by: string; department: string; total_amount: number; created_by: string }
  const f = form as FormRow

  if (f.status !== 'pending') {
    return NextResponse.json({
      error: `Cannot ${body.action} a requisition with status '${f.status}'`,
    }, { status: 409 })
  }

  const newStatus = body.action === 'approve' ? 'approved' : 'rejected'
  const now = new Date().toISOString()

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  const { error: updateErr } = await db.from('aie_forms').update({
    status:      newStatus,
    approved_by: (staff as { id: string } | null)?.id ?? null,
    approved_at: now,
    notes:       body.reason ?? null,
  }).eq('id', id).eq('school_id', auth.schoolId!)

  if (updateErr) {
    console.error('[requisitions/approve]', updateErr.message)
    return NextResponse.json({ error: 'Failed to update requisition' }, { status: 500 })
  }

  // Notify requester by SMS if approved
  if (body.action === 'approve') {
    try {
      const { data: requesterStaff } = await db
        .from('staff_records')
        .select('phone_number, full_name')
        .eq('id', f.created_by)
        .single()

      type StaffContact = { phone_number: string | null; full_name: string | null }
      const rs = requesterStaff as StaffContact | null

      if (rs?.phone_number) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            to: rs.phone_number,
            message: `Dear ${rs.full_name ?? 'staff'}, your requisition (${f.department}) for KES ${f.total_amount.toLocaleString('en-KE')} has been APPROVED by the Principal.`,
          }),
        }).catch(e => console.error('[requisitions/approve] sms:', e))
      }
    } catch (e) {
      console.error('[requisitions/approve] notify error:', e)
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
