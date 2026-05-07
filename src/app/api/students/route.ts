// GET /api/students
// Role-gated student listing with field-level security.
// class_teacher → own class only
// form_principal_form4 → all Form 4 streams
// form_principal_grade10 → all Grade 10 streams
// hod_*, principal, deputy, dean → all students
// subject_teacher / others → all students (class filter via ?class=&stream=)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const LEADERSHIP = new Set([
  'principal','deputy_principal','deputy_principal_academic',
  'deputy_principal_academics','deputy_principal_admin',
  'deputy_principal_discipline','dean_of_studies',
  'deputy_dean_of_studies','dean_of_students','qaso',
])

const HOD_ROLES = new Set([
  'hod_sciences','hod_mathematics','hod_languages',
  'hod_humanities','hod_applied_sciences','hod_games_sports',
  'hod_arts','hod_social_sciences','hod_technical','hod_pathways',
])

const FINANCE = new Set(['accountant','bursar'])

function selectFields(subRole: string): string {
  if (LEADERSHIP.has(subRole) || HOD_ROLES.has(subRole)) {
    return 'id,full_name,admission_no,gender,class_name,stream_name,photo_url,date_of_birth,kcpe_marks'
  }
  if (FINANCE.has(subRole)) {
    return 'id,full_name,admission_no,class_name,stream_name'
  }
  return 'id,full_name,admission_no,gender,class_name,stream_name,photo_url'
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db  = createAdminSupabaseClient()
  const sp  = req.nextUrl.searchParams
  const search     = sp.get('search') ?? ''
  const classParam = sp.get('class')  ?? sp.get('class_name')
  const streamParam= sp.get('stream') ?? sp.get('stream_name')
  const limitParam = parseInt(sp.get('limit') ?? '500')

  const fields = selectFields(auth.subRole)
  let query = db.from('students')
    .select(fields)
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .limit(Math.min(limitParam, 1000))

  const role = auth.subRole

  if (role === 'class_teacher') {
    const { data: sr } = await db
      .from('staff_records')
      .select('assigned_class')
      .eq('user_id', auth.userId)
      .eq('school_id', auth.schoolId)
      .single()

    if (!sr?.assigned_class) {
      return NextResponse.json({ students: [], message: 'No class assigned yet' })
    }
    const parts = sr.assigned_class.split(' ')
    const streamName = parts[parts.length - 1]
    const className  = parts.slice(0, -1).join(' ')
    query = query.eq('class_name', className).eq('stream_name', streamName)

  } else if (role === 'form_principal_form4') {
    query = query.eq('class_name', 'Form 4')

  } else if (role === 'form_principal_grade10') {
    query = query.eq('class_name', 'Grade 10')

  } else if (!LEADERSHIP.has(role) && !HOD_ROLES.has(role) && !FINANCE.has(role)) {
    // subject_teacher, counselor, nurse, etc — filter by ?class=&stream= if provided
    if (classParam) query = query.eq('class_name', classParam)
    if (streamParam) query = query.eq('stream_name', streamParam)
  } else {
    // leadership / HOD / finance — filter if explicit params passed
    if (classParam)  query = query.eq('class_name',  classParam)
    if (streamParam) query = query.eq('stream_name', streamParam)
  }

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,admission_no.ilike.%${search}%`)
  }

  const { data, error } = await query.order('full_name')
  if (error) {
    console.error('[students]', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ students: data ?? [], total: data?.length ?? 0 })
}
