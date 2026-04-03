import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      token,
      school_id,
      student_id,
      teacher_id,
      class_name,
      subject,
      competency_communication,
      competency_critical_thinking,
      competency_creativity,
      competency_collaboration,
      competency_character,
      subject_remarks,
      quick_tag,
    } = body

    if (!token || !student_id || !class_name || !subject) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    const currentTerm = new Date().getMonth() < 4 ? 1 : new Date().getMonth() < 8 ? 2 : 3
    const currentYear = new Date().getFullYear().toString()

    const { error } = await supabase
      .from('student_remarks')
      .upsert(
        {
          school_id,
          student_id,
          teacher_id,
          class_name,
          subject,
          term: currentTerm,
          academic_year: currentYear,
          competency_communication: competency_communication ?? null,
          competency_critical_thinking: competency_critical_thinking ?? null,
          competency_creativity: competency_creativity ?? null,
          competency_collaboration: competency_collaboration ?? null,
          competency_character: competency_character ?? null,
          subject_remarks: subject_remarks || null,
          quick_tag: quick_tag || null,
        },
        { onConflict: 'student_id,teacher_id,subject,term,academic_year' }
      )

    if (error) {
      console.error('student_remarks upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('student-remarks route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const studentId = searchParams.get('studentId')
  const subject = searchParams.get('subject')

  if (!studentId) return NextResponse.json({ remarks: [] })

  const supabase = createAdminSupabaseClient()
  let query = supabase
    .from('student_remarks')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (subject) query = query.eq('subject', subject)

  const { data } = await query.limit(10)
  return NextResponse.json({ remarks: data ?? [] })
}
