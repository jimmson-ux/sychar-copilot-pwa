import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { z } from 'zod'

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID!

const ValidateSchema = z.object({
  phone:          z.string().min(7),
  fullName:       z.string().min(2),
  departmentCode: z.string().min(2).max(10).toUpperCase(),
})

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ValidateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { phone, fullName, departmentCode } = parsed.data
  const digits = phone.replace(/\D/g, '').slice(-9)
  const sb = getClient()

  // 1. Look up department code
  const { data: dept } = await sb
    .from('department_codes')
    .select('*')
    .eq('school_id', SCHOOL_ID)
    .eq('code', departmentCode)
    .eq('is_active', true)
    .single()

  if (!dept) {
    return NextResponse.json({
      valid: false,
      error: 'Invalid department code. Contact the Dean of Studies.',
    }, { status: 200 })
  }

  // 2. Look up staff by phone number
  const { data: staffRows } = await sb
    .from('staff_records')
    .select('id, full_name, subject_specialization, sub_role, phone')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)
    .ilike('phone', `%${digits}`)
    .limit(5)

  if (!staffRows || staffRows.length === 0) {
    return NextResponse.json({ valid: false, error: 'Phone number not found. Contact your HOD.' }, { status: 200 })
  }

  // Prefer exact name match, fall back to first phone match
  const nameLower = fullName.trim().toLowerCase()
  const staff =
    staffRows.find(s => s.full_name.toLowerCase() === nameLower) ??
    staffRows.find(s => s.full_name.toLowerCase().includes(nameLower.split(' ')[0])) ??
    staffRows[0]

  // 3. Guidance & Counselling bypasses subject check
  if (departmentCode === '05C') {
    return NextResponse.json({
      valid: true,
      isCounsellor: true,
      staffId:        staff.id,
      teacherName:    staff.full_name,
      department:     dept.department,
      departmentCode,
      colorPrimary:   dept.color_primary,
      colorSecondary: dept.color_secondary,
    })
  }

  // 4. Validate subject belongs to this department
  const subjectName: string = staff.subject_specialization ?? ''
  const subjects: string[] = dept.subjects ?? []

  if (!subjects.includes(subjectName)) {
    return NextResponse.json({
      valid: false,
      error: `This code is for the ${dept.department} department. Your subject (${subjectName || 'unknown'}) belongs to a different department.`,
    }, { status: 200 })
  }

  // 5. Issue a short-lived teacher session token (8 hours)
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()

  await sb.from('teacher_tokens').insert({
    token,
    teacher_id:   staff.id,
    school_id:    SCHOOL_ID,
    subject_name: staff.subject_specialization,
    expires_at:   expiresAt,
    is_active:    true,
    sent_via:     'dept_code',
  })

  return NextResponse.json({
    valid: true,
    isCounsellor:   false,
    staffId:        staff.id,
    teacherName:    staff.full_name,
    subjectName:    staff.subject_specialization,
    subRole:        staff.sub_role,
    department:     dept.department,
    departmentCode,
    colorPrimary:   dept.color_primary,
    colorSecondary: dept.color_secondary,
    token,
  })
}
