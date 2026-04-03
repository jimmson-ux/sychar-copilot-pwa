import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { HodReportSchema } from '@/lib/scannerSchemas'

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

  const parsed = HodReportSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { reportData, issuesRaised, actionItems } = parsed.data

  // 3. Insert department report — schoolId and hodId from verified auth
  const { data: report, error } = await supabase
    .from('department_reports')
    .insert({
      school_id:    auth.schoolId,
      hod_id:       auth.userId,
      department:   reportData.department,
      report_date:  reportData.reportDate,
      issues:       issuesRaised,
      action_items: actionItems,
      raw_text:     `HOD: ${reportData.hodName}`,
    })
    .select()
    .single()

  if (error) {
    console.error('[hod-report] insert error:', error.message)
    return NextResponse.json({ success: false, error: 'Failed to save report' }, { status: 500 })
  }

  // 4. Log to OCR log — schoolId and userId from verified auth
  await supabase.from('ocr_log').insert({
    task:      'ocr_hod_report',
    school_id: auth.schoolId,
    user_id:   auth.userId,
    success:   true,
  })

  return NextResponse.json({ success: true, saved: report })
}
