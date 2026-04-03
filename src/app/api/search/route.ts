import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || ''
  const schoolId = searchParams.get('schoolId') || ''

  if (!q || q.length < 2 || !schoolId) {
    return NextResponse.json({ results: [] })
  }

  const supabase = createAdminSupabaseClient()
  const results: Array<{ type: string; id: string; title: string; subtitle: string; link: string }> = []

  const searchTerm = `%${q}%`

  const [studentsRes, staffRes] = await Promise.allSettled([
    supabase
      .from('students')
      .select('id, full_name, admission_number, class_name, stream_name')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .or(`full_name.ilike.${searchTerm},admission_number.ilike.${searchTerm}`)
      .limit(5),
    supabase
      .from('staff_records')
      .select('id, full_name, sub_role, department, subject_specialization')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .ilike('full_name', searchTerm)
      .limit(5),
  ])

  if (studentsRes.status === 'fulfilled' && studentsRes.value.data) {
    studentsRes.value.data.forEach((s: { id: string; full_name: string; admission_number: string | null; class_name: string | null; stream_name: string | null }) => {
      results.push({
        type: 'student',
        id: s.id,
        title: s.full_name,
        subtitle: `${s.class_name ?? ''} ${s.stream_name ?? ''} · ${s.admission_number ?? ''}`,
        link: `/dashboard/students?search=${encodeURIComponent(s.full_name)}`,
      })
    })
  }

  if (staffRes.status === 'fulfilled' && staffRes.value.data) {
    staffRes.value.data.forEach((s: { id: string; full_name: string; sub_role: string | null; department: string | null; subject_specialization: string | null }) => {
      results.push({
        type: 'staff',
        id: s.id,
        title: s.full_name,
        subtitle: `${s.sub_role ?? ''} · ${s.department ?? ''}`,
        link: `/dashboard/staff?search=${encodeURIComponent(s.full_name)}`,
      })
    })
  }

  return NextResponse.json({ results })
}
