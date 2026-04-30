// GET  /api/seating?class=&stream=&term=&year=
// POST /api/seating — save a seating layout

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db         = createAdminSupabaseClient()
  const searchParams = req.nextUrl.searchParams
  const className  = searchParams.get('class')
  const streamName = searchParams.get('stream')
  const term       = searchParams.get('term')
  const year       = searchParams.get('year') ?? '2025/2026'

  if (!className) return NextResponse.json({ error: 'class is required' }, { status: 400 })

  let query = db
    .from('seating_arrangements')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('class_name', className)
    .eq('academic_year', year)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (streamName) query = query.eq('stream_name', streamName)
  if (term)       query = query.eq('term', parseInt(term))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch seating' }, { status: 500 })

  return NextResponse.json({ seating: data?.[0] ?? null })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({})) as {
    class_name?: string
    stream_name?: string
    term?: number
    academic_year?: string
    layout?: unknown[]
  }

  if (!body.class_name || !body.layout || !body.academic_year) {
    return NextResponse.json({ error: 'class_name, layout, and academic_year are required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: staffRow } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  if (!staffRow?.id) return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })

  const { data, error } = await db
    .from('seating_arrangements')
    .upsert({
      school_id:     auth.schoolId,
      class_name:    body.class_name,
      stream_name:   body.stream_name ?? null,
      teacher_id:    staffRow.id,
      term:          body.term ?? null,
      academic_year: body.academic_year,
      layout:        body.layout,
      is_active:     true,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'school_id,class_name,stream_name,term,academic_year' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ seating: data })
}
