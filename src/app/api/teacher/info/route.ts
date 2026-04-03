import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateTeacherToken } from '@/lib/validateTeacherToken'

// GET /api/teacher/info?token=xxx
// Returns teacher name, subject, and all classes they teach.
// Used by /record page after token validation.

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token || token.length < 8) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const info = await validateTeacherToken(token)
  if (!info) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 })
  }

  // Fetch all classes this teacher is assigned to
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: assignments } = await sb
    .from('timetable')
    .select('assigned_class_name, subject_specialization')
    .eq('teacher_id', info.teacherId)
    .eq('school_id', info.schoolId)

  // Deduplicate classes
  const classSet = new Set<string>()
  if (info.className) classSet.add(info.className)
  for (const a of assignments ?? []) {
    if (a.assigned_class_name) classSet.add(a.assigned_class_name)
  }

  return NextResponse.json({
    teacherName: info.teacherName,
    teacherId:   info.teacherId,
    schoolId:    info.schoolId,
    subjectName: info.subjectName,
    classes:     [...classSet],
    formLevels:  info.formLevels,
    tokenId:     info.tokenId,
  })
}
