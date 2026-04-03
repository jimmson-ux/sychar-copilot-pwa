import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateTeacherToken } from '@/lib/validateTeacherToken'

// GET /api/teacher/students?token=xxx&className=Form+3+Champions

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token     = searchParams.get('token')
  const className = searchParams.get('className')

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  if (!className) return NextResponse.json({ error: 'Missing className' }, { status: 400 })

  const info = await validateTeacherToken(token)
  if (!info) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: students, error } = await sb
    .from('students')
    .select('id, full_name, admission_number, gender')
    .eq('school_id', info.schoolId)
    .eq('class_name', className)
    .eq('is_active', true)
    .order('full_name')

  if (error) {
    console.error('[teacher/students]', error.message)
    return NextResponse.json({ error: 'Failed to load students' }, { status: 500 })
  }

  return NextResponse.json({ students: students ?? [] })
}
