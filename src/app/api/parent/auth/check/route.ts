import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/check
 *
 * Previews whether a student record exists before committing to login.
 * Returns a partial view — enough for the UI to confirm the right child
 * without exposing sensitive data.
 *
 * Body:
 *   { school_code, admission_no }
 *   { school_code, class_name, student_name }
 *
 * Does NOT issue a JWT — call /api/parent/auth/verify-by-details for that.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    school_code?:  string
    admission_no?: string
    class_name?:   string
    student_name?: string
  }

  const { school_code, admission_no, class_name, student_name } = body

  if (!school_code?.trim()) {
    return NextResponse.json({ error: 'school_code is required' }, { status: 400 })
  }
  if (!admission_no?.trim() && !student_name?.trim()) {
    return NextResponse.json({ error: 'Provide admission_no, or class_name + student_name' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Resolve school
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .or(
      `slug.eq.${school_code.trim().toLowerCase()},school_short_code.eq.${school_code.trim().toUpperCase()}`,
    )
    .limit(1)
    .single()

  if (!tenant) {
    return NextResponse.json({ found: false, error: 'School code not recognised' }, { status: 404 })
  }

  const schoolId = (tenant as { school_id: string }).school_id

  // Find student
  type Row = { id: string; full_name: string; class_name: string | null; admission_no: string | null }
  let rows: Row[] = []

  if (admission_no?.trim()) {
    const { data } = await svc
      .from('students')
      .select('id, full_name, class_name, admission_no')
      .eq('school_id', schoolId)
      .eq('admission_no', admission_no.trim())
      .limit(1)
    rows = (data ?? []) as Row[]
  } else {
    const q = svc
      .from('students')
      .select('id, full_name, class_name, admission_no')
      .eq('school_id', schoolId)
      .ilike('full_name', `%${student_name!.trim()}%`)
    const { data } = class_name?.trim()
      ? await q.ilike('class_name', `%${class_name.trim()}%`).limit(5)
      : await q.limit(5)
    rows = (data ?? []) as Row[]
  }

  if (rows.length === 0) {
    return NextResponse.json({ found: false })
  }

  // Return masked preview — enough to confirm, not enough to enumerate
  const s = rows[0]
  const nameParts  = (s.full_name as string).split(' ')
  const maskedName = nameParts[0] + (nameParts.length > 1 ? ' ' + nameParts.slice(1).map(() => '***').join(' ') : '')

  return NextResponse.json({
    found:       true,
    school_name: (tenant as { name: string }).name,
    preview: {
      masked_name:  maskedName,
      class_name:   s.class_name,
      has_adm_no:   !!s.admission_no,
    },
    count: rows.length,
  })
}
