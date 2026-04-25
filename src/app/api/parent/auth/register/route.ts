// POST /api/parent/auth/register
// Body: { phone, schoolCode, studentName, admissionNo }
// Registers a parent by linking them to a student via name + admission number.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254')) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+254' + digits.slice(1)
  if (digits.length === 9) return '+254' + digits
  return '+' + digits
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    phone?: string
    schoolCode?: string
    studentName?: string
    admissionNo?: string
  }

  if (!body.phone?.trim() || !body.schoolCode?.trim() ||
      !body.studentName?.trim() || !body.admissionNo?.trim()) {
    return NextResponse.json(
      { error: 'phone, schoolCode, studentName and admissionNo required' },
      { status: 400 }
    )
  }

  const phone      = normalizePhone(body.phone.trim())
  const schoolCode = body.schoolCode.trim().toUpperCase()
  const svc        = createAdminSupabaseClient()

  // Resolve school
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .eq('school_short_code', schoolCode)
    .single()

  if (!tenant) {
    return NextResponse.json({ error: 'School not found. Check your school code.' }, { status: 404 })
  }

  const schoolId   = (tenant as { school_id: string }).school_id
  const schoolName = (tenant as { name: string }).name
  const nameSearch = body.studentName.trim().toLowerCase()
  const admNo      = body.admissionNo.trim().toLowerCase()

  // Find student: case-insensitive name match + admission number
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name, current_form, admission_no, parent_phone, parent2_phone')
    .eq('school_id', schoolId)
    .ilike('full_name', `%${nameSearch}%`)
    .eq('is_active', true)

  type StudentRow = {
    id: string; full_name: string; class_name: string | null; current_form: string | null
    admission_no: string | null; parent_phone: string | null; parent2_phone: string | null
  }

  const match = ((students ?? []) as StudentRow[]).find(
    s => (s.admission_no ?? '').toLowerCase() === admNo
  )

  if (!match) {
    return NextResponse.json({
      found: false,
      error: 'Student not found. Check the name and admission number and try again.',
    }, { status: 404 })
  }

  // If student has a different parent phone already registered, link as parent2
  const isAlreadyLinked = match.parent_phone === phone || match.parent2_phone === phone

  if (!isAlreadyLinked) {
    const updateField = match.parent_phone ? 'parent2_phone' : 'parent_phone'
    await svc
      .from('students')
      .update({ [updateField]: phone })
      .eq('id', match.id)
      .eq('school_id', schoolId)
  }

  // Fetch all students linked to this phone in this school
  const { data: linkedStudents } = await svc
    .from('students')
    .select('id, full_name, class_name')
    .eq('school_id', schoolId)
    .or(`parent_phone.eq.${phone},parent2_phone.eq.${phone}`)
    .eq('is_active', true)

  return NextResponse.json({
    found:      true,
    schoolId,
    schoolName,
    registered: true,
    students:   (linkedStudents ?? []).map((s: { id: string; full_name: string; class_name: string | null }) => ({
      id: s.id, name: s.full_name, class: s.class_name,
    })),
    message: `Successfully linked to ${match.full_name}. You can now log in with your phone number.`,
  })
}
