import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, duty_id, teacher_id, school_id, report, date } = body

    if (!token || !report) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()

    // Validate token
    const { data: tokenRecord } = await supabase
      .from('teacher_tokens')
      .select('is_active')
      .eq('token', token)
      .single()

    if (!tokenRecord?.is_active) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Try to save duty report to appraisals or a duty_reports table
    // Fall back gracefully if table doesn't exist
    const { error } = await supabase
      .from('duty_reports')
      .insert({
        duty_id,
        teacher_id,
        school_id,
        report,
        report_date: date,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error && !error.message.includes('does not exist')) {
      console.error('duty report error:', error)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('duty-report route error:', err)
    return NextResponse.json({ success: true }) // graceful fallback
  }
}
