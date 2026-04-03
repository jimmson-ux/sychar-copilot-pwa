import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { ApologySchema } from '@/lib/scannerSchemas'

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

  // 2. Validate body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ApologySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { extractedData, inboxId } = parsed.data

  // 3. Resolve student by admission number — scoped to this school to prevent cross-tenant match
  let studentId: string | null = null
  if (extractedData.admission_number) {
    const { data: student } = await supabase
      .from('students')
      .select('id')
      .eq('admission_number', extractedData.admission_number)
      .eq('school_id', auth.schoolId)
      .single()
    studentId = student?.id ?? null
  }

  // 4. Insert discipline record — schoolId from verified auth, never the body
  const { data: record, error } = await supabase
    .from('discipline_records')
    .insert({
      school_id:        auth.schoolId,
      student_id:       studentId,
      student_name:     extractedData.student_name,
      admission_number: extractedData.admission_number,
      class_name:       extractedData.class_name,
      teacher_id:       auth.userId,
      letter_date:      extractedData.letter_date,
      offence:          extractedData.offence_committed,
      parent_signed:    extractedData.parent_signed ?? false,
      teacher_signed:   false,
      tone:             extractedData.tone,
      notes:            extractedData.teacher_witness
        ? `Witness: ${extractedData.teacher_witness}`
        : null,
      document_inbox_id: inboxId,
    })
    .select()
    .single()

  if (error) {
    console.error('[apology-letter] insert error:', error.message)
    return NextResponse.json({ success: false, error: 'Failed to save record' }, { status: 500 })
  }

  // 5. Mark inbox record as saved — only update records owned by this school
  if (inboxId) {
    await supabase
      .from('document_inbox')
      .update({ status: 'saved' })
      .eq('id', inboxId)
      .eq('school_id', auth.schoolId)
  }

  return NextResponse.json({ success: true, saved: record })
}
