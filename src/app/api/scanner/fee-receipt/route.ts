import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { FeeReceiptSingleSchema, FeeReceiptBatchSchema } from '@/lib/scannerSchemas'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  const supabase = getClient()
  // 1. Verify session
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Batch path ────────────────────────────────────────────────────────────

  if (typeof rawBody === 'object' && rawBody !== null && (rawBody as Record<string, unknown>).isBatch === true) {
    const parsed = FeeReceiptBatchSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const inserts = parsed.data.batch.map((d) => ({
      school_id:            auth.schoolId,
      amount_paid:          d.amount,
      payment_date:         d.date,
      mpesa_transaction_id: d.transaction_id,
      paid_by_name:         d.sender_name,
      paid_by_phone:        d.sender_phone,
      payment_method:       'M-Pesa',
    }))

    const { error } = await supabase.from('fee_records').insert(inserts)
    if (error) {
      console.error('[fee-receipt] batch insert error:', error.message)
      return NextResponse.json({ success: false, error: 'Failed to save batch' }, { status: 500 })
    }
    return NextResponse.json({ success: true, saved: inserts.length })
  }

  // ── Single receipt path ───────────────────────────────────────────────────

  const parsed = FeeReceiptSingleSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { extractedData, studentId, studentName } = parsed.data

  // Verify studentId belongs to this school — prevents cross-tenant linkage
  let verifiedStudentId: string | null = null
  let verifiedStudentName: string | null = studentName
  if (studentId) {
    const { data: student } = await supabase
      .from('students')
      .select('id, name')
      .eq('id', studentId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!student) {
      return NextResponse.json(
        { success: false, error: 'Student not found in this school' },
        { status: 400 }
      )
    }
    verifiedStudentId   = student.id
    verifiedStudentName = student.name
  }

  const { data: record, error } = await supabase
    .from('fee_records')
    .insert({
      school_id:            auth.schoolId,
      student_id:           verifiedStudentId,
      student_name:         verifiedStudentName ?? extractedData.paid_by_name,
      admission_number:     null, // resolved from verifiedStudentId if needed
      amount_paid:          extractedData.amount_paid,
      payment_date:         extractedData.payment_date,
      receipt_number:       extractedData.reference_number,
      term:                 extractedData.term,
      payment_method:       extractedData.payment_method,
      reference_number:     extractedData.reference_number,
      mpesa_transaction_id: extractedData.mpesa_transaction_id,
      paid_by_name:         extractedData.paid_by_name,
    })
    .select()
    .single()

  if (error) {
    console.error('[fee-receipt] single insert error:', error.message)
    return NextResponse.json({ success: false, error: 'Failed to save record' }, { status: 500 })
  }

  return NextResponse.json({ success: true, saved: record })
}
