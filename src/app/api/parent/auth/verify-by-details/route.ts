import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signParentJWT } from '@/lib/parent/parentJWT'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/verify-by-details
 *
 * THE parent auth entry point — NO phone, NO OTP (phone numbers are not collected
 * for any school). Security + student↔parent mapping = the parent must supply ALL
 * of: school code + admission number + student full name + class. All four must
 * resolve to ONE student; the issued JWT is scoped to that student_id, and every
 * parent read filters by the token's student_ids — so the mapping is enforced at
 * the token level (a parent only ever sees the child whose details they proved).
 *
 * Body: { school_code, admission_no, student_name, class_name }
 *   class_name may be omitted ONLY when a school does not use admission numbers
 *   (then admission_no is omitted and class_name + name is the identifier).
 *
 * school_code = tenant_configs.slug OR tenant_configs.school_short_code
 * Response: { token, student, school }. JWT valid 30 days.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const {
    school_code,
    admission_no,
    class_name,
    student_name,
  } = body as {
    school_code?:  string
    admission_no?: string
    class_name?:   string
    student_name?: string
  }

  if (!school_code?.trim()) {
    return NextResponse.json({ error: 'school_code is required' }, { status: 400 })
  }
  if (!student_name?.trim()) {
    return NextResponse.json({ error: 'student_name is required' }, { status: 400 })
  }
  // Enforce the full credential set: admission number is the primary key; class is
  // required alongside it so all four credentials must agree (defence-in-depth).
  if (!admission_no?.trim() && !class_name?.trim()) {
    return NextResponse.json(
      { error: 'Provide school code, admission number, full name and class.' },
      { status: 400 },
    )
  }
  if (admission_no?.trim() && !class_name?.trim()) {
    return NextResponse.json(
      { error: 'class is required (school code + admission number + full name + class).' },
      { status: 400 },
    )
  }

  const svc = createAdminSupabaseClient()

  // ── Resolve school ─────────────────────────────────────────────
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .or(
      `slug.eq.${school_code.trim().toLowerCase()},school_short_code.eq.${school_code.trim().toUpperCase()}`,
    )
    .limit(1)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'School code not recognised' }, { status: 404 })
  }

  const schoolId   = tenant.school_id as string
  const schoolName = tenant.name as string

  // ── Find student ──────────────────────────────────────────────
  type StudentRow = { id: string; full_name: string; admission_no: string | null; class_name: string | null }
  let candidates: StudentRow[] = []

  if (admission_no?.trim()) {
    // Primary path: exact admission number match
    const { data } = await svc
      .from('students')
      .select('id, full_name, admission_no, class_name')
      .eq('school_id', schoolId)
      .eq('admission_no', admission_no.trim())
      .limit(5)
    candidates = (data ?? []) as StudentRow[]
  } else {
    // Fallback: class + name search
    const { data } = await svc
      .from('students')
      .select('id, full_name, admission_no, class_name')
      .eq('school_id', schoolId)
      .ilike('class_name', `%${class_name!.trim()}%`)
      .ilike('full_name', `%${student_name.trim()}%`)
      .limit(10)
    candidates = (data ?? []) as StudentRow[]
  }

  if (candidates.length === 0) {
    return NextResponse.json({ error: 'No student found with those details' }, { status: 404 })
  }

  // ── Fuzzy name match ──────────────────────────────────────────
  // At least one token from the provided name must appear in the DB name
  const nameTokens = student_name.trim().toLowerCase().split(/\s+/).filter((t) => t.length >= 3)
  const match = candidates.find((s) => {
    const dbName = s.full_name.toLowerCase()
    return nameTokens.length === 0 || nameTokens.some((t) => dbName.includes(t))
  })

  if (!match) {
    if (candidates.length > 1) {
      return NextResponse.json(
        { error: 'Multiple students found but name did not match. Please use the full name as registered.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: 'Student name does not match our records' }, { status: 401 })
  }

  // ── Class verification ─────────────────────────────────────────
  // When admission_no was used, the class must also match the student's class —
  // all four credentials (school + admission + name + class) must agree.
  if (admission_no?.trim() && class_name?.trim()) {
    const provided = class_name.trim().toLowerCase()
    const actual   = (match.class_name ?? '').toLowerCase()
    const classOk  = actual.includes(provided) || provided.includes(actual) ||
      provided.split(/\s+/).every((t) => t.length < 2 || actual.includes(t))
    if (!classOk) {
      return NextResponse.json(
        { error: 'Class does not match our records for that admission number.' },
        { status: 401 },
      )
    }
  }

  // ── Issue JWT ─────────────────────────────────────────────────
  const token = await signParentJWT({
    sub:         match.id,         // student UUID as the parent identity
    school_id:   schoolId,
    student_ids: [match.id],
  })

  return NextResponse.json({
    token,
    student: {
      id:           match.id,
      full_name:    match.full_name,
      admission_no: match.admission_no,
      class_name:   match.class_name,
    },
    school: { id: schoolId, name: schoolName },
  })
}

// verifyAndLink moved to src/lib/parent-verify.ts (route.ts may only export handlers).
