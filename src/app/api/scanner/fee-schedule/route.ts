import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { FeeScheduleSchema } from '@/lib/scannerSchemas'

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

  const parsed = FeeScheduleSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { feeItems, term, academicYear, formGrade } = parsed.data

  // 3. Delete existing items for this term/grade — scoped to verified school
  await supabase
    .from('fee_structure_items')
    .delete()
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .eq('form_grade', formGrade)

  // 4. Insert new items
  const inserts = feeItems.map((item) => ({
    school_id:     auth.schoolId,
    item_name:     item.item_name,
    amount:        item.amount ? parseFloat(item.amount) : null,
    due_date:      item.due_date || null,
    mandatory:     item.mandatory,
    notes:         item.notes   || null,
    term,
    academic_year: academicYear,
    form_grade:    formGrade,
  }))

  const { error } = await supabase.from('fee_structure_items').insert(inserts)
  if (error) {
    console.error('[fee-schedule] insert error:', error.message)
    return NextResponse.json({ success: false, error: 'Failed to save fee schedule' }, { status: 500 })
  }

  return NextResponse.json({ success: true, updated: inserts.length })
}
