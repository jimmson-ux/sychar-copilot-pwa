import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signParentJWT } from '@/lib/parent/parentJWT'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/verify-by-details
 *
 * THE auth entry point — no phone, no OTP.
 * Security = knowing your child's school + admission number + name
 *            (or class name + name for schools without admission numbers).
 *
 * Body:
 *   { school_code, admission_no, student_name }
 *   { school_code, class_name,   student_name }
 *
 * school_code = tenant_configs.slug  OR  tenant_configs.school_short_code
 *
 * Response: { token, student, school }
 * The JWT contains school_id + [student_id] and is valid for 30 days.
 * Parents can verify additional children and accumulate student_ids in the app.
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
  if (!admission_no?.trim() && !class_name?.trim()) {
    return NextResponse.json(
      { error: 'Provide admission_no, or class_name + student_name' },
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

// ── Shared helper (used by Groq chat route) ──────────────────────────────────

export async function verifyAndLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc:              any,
  _parentIdentifier: string,
  schoolId:          string,
  studentName:       string,
  admissionNumber:   string,
): Promise<
  | { verified: true;  studentId: string; studentName: string; className: string }
  | { verified: false; reason: 'not_found' }
> {
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name')
    .eq('school_id', schoolId)
    .eq('admission_no', admissionNumber.trim())
    .limit(5)

  if (!students?.length) return { verified: false, reason: 'not_found' }

  const tokens = studentName.toLowerCase().split(/\s+/).filter((t: string) => t.length >= 3)
  const match  = (students as { id: string; full_name: string; class_name: string }[]).find(
    (s) => tokens.length === 0 || tokens.some((t: string) => s.full_name.toLowerCase().includes(t)),
  )
  if (!match) return { verified: false, reason: 'not_found' }

  return { verified: true, studentId: match.id, studentName: match.full_name, className: match.class_name }
}
