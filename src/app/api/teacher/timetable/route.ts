import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const teacherId = searchParams.get('teacherId')
  const schoolId = searchParams.get('schoolId')

  if (!token || !teacherId) {
    return NextResponse.json({ timetable: [] })
  }

  const supabase = createAdminSupabaseClient()

  // Validate token
  const { data: tokenRecord } = await supabase
    .from('teacher_tokens')
    .select('is_active, expires_at')
    .eq('token', token)
    .single()

  if (!tokenRecord?.is_active) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data } = await supabase
    .from('timetable')
    .select('id, day, period, subject, subject_code, class_name, room')
    .eq('school_id', schoolId ?? '')
    .eq('teacher_id', teacherId)
    .order('period')

  return NextResponse.json({ timetable: data ?? [] })
}
