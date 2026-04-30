// POST /api/parent/auth/verify-by-details
// Called by the Groq chat when a parent is not yet linked to any student.
// Verifies identity via admission number + fuzzy name match, then links parent.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({})) as {
    student_name?:     string
    admission_number?: string
  }

  const studentName      = body.student_name?.trim()
  const admissionNumber  = body.admission_number?.trim()

  if (!studentName || !admissionNumber) {
    return NextResponse.json(
      { error: 'student_name and admission_number are required' },
      { status: 400 }
    )
  }

  const svc    = createAdminSupabaseClient()
  const result = await verifyAndLink(svc, parent.phone, parent.schoolId, studentName, admissionNumber)

  if (!result.verified) {
    return NextResponse.json({ verified: false, reason: result.reason }, { status: 200 })
  }

  return NextResponse.json({
    verified:     true,
    student_id:   result.studentId,
    student_name: result.studentName,
    class_name:   result.className,
  })
}

// ── Shared verification helper (also used by Groq route) ──────────────────────
export async function verifyAndLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  parentIdentifier: string,
  schoolId:         string,
  studentName:      string,
  admissionNumber:  string,
): Promise<
  | { verified: true;  studentId: string; studentName: string; className: string }
  | { verified: false; reason: 'not_found' | 'already_linked' }
> {
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name, parent_email, parent_phone')
    .eq('school_id', schoolId)
    .ilike('admission_number', admissionNumber)
    .limit(5)

  if (!students?.length) return { verified: false, reason: 'not_found' }

  // Fuzzy name match — at least one token from the provided name must appear in the DB name
  const nameTokens = studentName.toLowerCase().split(/\s+/).filter(Boolean)
  const match = (students as {
    id: string; full_name: string; class_name: string
    parent_email: string | null; parent_phone: string | null
  }[]).find(s => {
    const dbName = s.full_name.toLowerCase()
    return nameTokens.some(t => t.length >= 3 && dbName.includes(t))
  })

  if (!match) return { verified: false, reason: 'not_found' }

  // If already linked to a *different* identity, block
  const isEmail = parentIdentifier.includes('@')
  if (isEmail) {
    if (match.parent_email && match.parent_email !== parentIdentifier) {
      return { verified: false, reason: 'already_linked' }
    }
  } else {
    if (match.parent_phone && match.parent_phone !== parentIdentifier) {
      return { verified: false, reason: 'already_linked' }
    }
  }

  // Link
  const updateField = isEmail ? 'parent_email' : 'parent_phone'
  await svc
    .from('students')
    .update({ [updateField]: parentIdentifier })
    .eq('id', match.id)

  return {
    verified:    true,
    studentId:   match.id,
    studentName: match.full_name,
    className:   match.class_name,
  }
}
