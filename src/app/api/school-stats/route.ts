// GET /api/school-stats — returns live school counts for the login page profile card

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID ?? '68bd8d34-f2f0-4297-bd18-093328824d84'

const TEACHING_ROLES = [
  'principal','deputy_principal','dean_of_studies','deputy_dean_of_studies',
  'dean_of_students','form_principal_form4','form_principal_grade10',
  'hod_sciences','hod_mathematics','hod_languages','hod_humanities',
  'hod_applied_sciences','hod_games_sports','class_teacher',
]

let _sb: ReturnType<typeof createClient> | null = null
function getSb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _sb
}

export async function GET() {
  const sb = getSb()
  const [studRes, boysRes, girlsRes, staffRes, classRes] = await Promise.all([
    sb.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID).eq('is_active', true),
    sb.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID).eq('is_active', true).eq('gender', 'male'),
    sb.from('students').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID).eq('is_active', true).eq('gender', 'female'),
    sb.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', SCHOOL_ID).eq('is_active', true).in('sub_role', TEACHING_ROLES),
    sb.from('students').select('class_name').eq('school_id', SCHOOL_ID).eq('is_active', true).not('class_name', 'is', null),
  ])

  const classes = new Set((classRes.data ?? []).map((r: { class_name: string }) => r.class_name)).size

  return NextResponse.json({
    students: studRes.count ?? 0,
    boys: boysRes.count ?? 0,
    girls: girlsRes.count ?? 0,
    staff: staffRes.count ?? 0,
    classes,
  })
}
