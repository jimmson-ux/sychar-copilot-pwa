import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const className = searchParams.get('className')
  const date = searchParams.get('date')
  const schoolId = searchParams.get('schoolId')

  const supabase = createAdminSupabaseClient()

  let query = supabase
    .from('attendance')
    .select('id, student_id, date, status, class_name')

  if (schoolId) query = query.eq('school_id', schoolId)
  if (studentId) query = query.eq('student_id', studentId)
  if (className) query = query.eq('class_name', className)
  if (date) query = query.eq('date', date)

  const { data, error } = await query.order('date', { ascending: false }).limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const records = data ?? []
  const total = records.length
  const present = records.filter((r: { status: string }) => r.status === 'present').length
  const absent = records.filter((r: { status: string }) => r.status === 'absent').length
  const rate = total > 0 ? Math.round((present / total) * 100) : 0

  return NextResponse.json({
    records,
    summary: { total, present, absent, rate }
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token, records } = body

    if (!token || !records || !Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'Missing token or records' }, { status: 400 })
    }

    const supabase = createAdminSupabaseClient()

    // Validate token
    const { data: tokenRecord } = await supabase
      .from('teacher_tokens')
      .select('teacher_id, is_active, expires_at')
      .eq('token', token)
      .single()

    if (!tokenRecord?.is_active) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    const { error } = await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'student_id,date' })

    if (error) {
      console.error('attendance upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: records.length })
  } catch (err) {
    console.error('attendance route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
