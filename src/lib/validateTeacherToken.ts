import { createClient } from '@supabase/supabase-js'

export interface TeacherTokenInfo {
  tokenId: string
  teacherId: string
  schoolId: string
  teacherName: string
  subjectName: string | null
  className: string | null
  formLevels: string[]
}

export async function validateTeacherToken(token: string): Promise<TeacherTokenInfo | null> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await sb
    .from('teacher_tokens')
    .select(`
      id,
      teacher_id,
      school_id,
      subject_name,
      class_name,
      form_levels,
      expires_at,
      is_active,
      used_count,
      max_uses,
      staff_records!teacher_id ( full_name )
    `)
    .eq('token', token)
    .single()

  if (error || !data) return null
  if (!data.is_active) return null
  if (new Date(data.expires_at) < new Date()) return null
  if (data.used_count >= data.max_uses) return null

  const staff = data.staff_records as unknown as { full_name: string } | null

  return {
    tokenId:     data.id,
    teacherId:   data.teacher_id,
    schoolId:    data.school_id,
    teacherName: staff?.full_name ?? 'Teacher',
    subjectName: data.subject_name ?? null,
    className:   data.class_name ?? null,
    formLevels:  (data.form_levels as string[]) ?? [],
  }
}
