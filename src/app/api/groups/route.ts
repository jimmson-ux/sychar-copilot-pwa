// GET  /api/groups?class=&subject=&term=&year=
// POST /api/groups — save generated groups

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db           = createAdminSupabaseClient()
  const searchParams = req.nextUrl.searchParams
  const className    = searchParams.get('class')
  const subject      = searchParams.get('subject')
  const term         = searchParams.get('term')
  const year         = searchParams.get('year') ?? '2025/2026'

  if (!className) return NextResponse.json({ error: 'class is required' }, { status: 400 })

  let query = db
    .from('student_groups')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('class_name', className)
    .eq('academic_year', year)
    .order('created_at', { ascending: false })
    .limit(20)

  if (subject) query = query.eq('subject_name', subject)
  if (term)    query = query.eq('term', parseInt(term))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch groups' }, { status: 500 })

  return NextResponse.json({ groups: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const required = ['class_name', 'subject_name', 'academic_year', 'groups']
  for (const f of required) {
    if (!body[f]) return NextResponse.json({ error: `${f} is required` }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  if (!staffRow?.id) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  const { data, error } = await db
    .from('student_groups')
    .insert({
      school_id:      auth.schoolId,
      teacher_id:     staffRow.id,
      class_name:     body.class_name,
      stream_name:    body.stream_name ?? null,
      subject_name:   body.subject_name,
      term:           body.term ?? null,
      academic_year:  body.academic_year,
      exam_type:      body.exam_type ?? null,
      groups:         body.groups,
      formation_type: body.formation_type ?? 'mixed',
      ai_rationale:   body.ai_rationale ?? null,
      expires_at:     body.expires_at ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data }, { status: 201 })
}
