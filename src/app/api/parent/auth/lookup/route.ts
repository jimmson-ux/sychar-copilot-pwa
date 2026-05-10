import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/lookup
 *
 * Step 1 of parent login. Two lookup modes:
 *   { school_code, admission_no }           — by admission number
 *   { school_code, student_name, class_name } — by name + class (schools without adm#)
 *
 * school_code = tenant_configs.slug  OR  tenant_configs.school_short_code
 *
 * Returns masked parent phone and a base64 context for the next OTP step.
 * Never reveals full phone, student name, or school internal IDs.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    school_code,
    admission_no,
    student_name,
    class_name,
  } = body as {
    school_code?:   string
    admission_no?:  string
    student_name?:  string
    class_name?:    string
  }

  if (!school_code?.trim()) {
    return NextResponse.json({ error: 'school_code is required' }, { status: 400 })
  }
  if (!admission_no?.trim() && !student_name?.trim()) {
    return NextResponse.json(
      { error: 'Provide admission_no, or student_name + class_name' },
      { status: 400 },
    )
  }

  const svc = createAdminSupabaseClient()

  // ── Resolve school from school_code ──────────────────────────
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .or(`slug.eq.${school_code.trim().toLowerCase()},school_short_code.eq.${school_code.trim().toUpperCase()}`)
    .limit(1)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'School code not recognised' }, { status: 404 })
  }

  const schoolId   = tenant.school_id as string
  const schoolName = tenant.name as string

  // ── Find student ──────────────────────────────────────────────
  let studentId: string | null = null
  let parentPhone: string | null = null

  if (admission_no?.trim()) {
    const { data: student } = await svc
      .from('students')
      .select('id, parent_phone, parent2_phone')
      .eq('school_id', schoolId)
      .eq('admission_no', admission_no.trim())
      .single()

    if (student) {
      studentId   = student.id as string
      parentPhone = (student.parent_phone as string) ?? (student.parent2_phone as string) ?? null
    }
  } else {
    // Name + class lookup
    let query = svc
      .from('students')
      .select('id, full_name, class_name, parent_phone, parent2_phone')
      .eq('school_id', schoolId)
      .ilike('full_name', `%${student_name!.trim()}%`)

    if (class_name?.trim()) {
      query = query.ilike('class_name', `%${class_name.trim()}%`)
    }

    const { data: matches } = await query.limit(5)

    if (!matches || matches.length === 0) {
      return NextResponse.json({ error: 'No student found with that name' }, { status: 404 })
    }
    if (matches.length > 1) {
      return NextResponse.json(
        {
          error:      'Multiple students match that name. Please provide admission_no or a more specific class.',
          candidates: (matches as Array<{ full_name: string; class_name: string }>)
            .map((s) => `${s.full_name} (${s.class_name ?? 'Unknown class'})`),
        },
        { status: 409 },
      )
    }

    const s = matches[0] as { id: string; parent_phone: string | null; parent2_phone: string | null }
    studentId   = s.id
    parentPhone = s.parent_phone ?? s.parent2_phone ?? null
  }

  if (!studentId) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }
  if (!parentPhone) {
    return NextResponse.json(
      { error: 'No parent contact registered for this student. Ask the school to update the record.' },
      { status: 422 },
    )
  }

  // Mask: show first 4 chars, last 3, mask the middle
  const p      = parentPhone
  const masked = p.slice(0, 4) + ' ' +
    '*'.repeat(Math.max(0, p.length - 7)).replace(/(.{3})/g, '$1 ').trim() +
    ' ' + p.slice(-3)

  return NextResponse.json({
    masked_phone: masked,
    school_name:  schoolName,
    _ctx: Buffer.from(JSON.stringify({ school_id: schoolId, student_id: studentId })).toString('base64'),
  })
}
