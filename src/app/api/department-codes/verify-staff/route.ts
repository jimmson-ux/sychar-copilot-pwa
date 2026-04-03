// POST /api/department-codes/verify-staff
// Called from /record?dept=xxx after teacher enters phone + full name.
// Looks up staff by phone, validates department membership, issues session token.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { z } from 'zod'

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID ?? '68bd8d34-f2f0-4297-bd18-093328824d84'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const Schema = z.object({
  phone:    z.string().min(7),
  fullName: z.string().min(2),
  deptId:   z.string().uuid(),
})

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { phone, fullName, deptId } = parsed.data
  const digits = phone.replace(/\D/g, '').slice(-9)
  const sb = getClient()

  // Load department
  const { data: dept } = await sb
    .from('department_codes')
    .select('department, code, subjects, color_primary, color_secondary, is_active')
    .eq('id', deptId)
    .eq('school_id', SCHOOL_ID)
    .single()

  if (!dept || !dept.is_active) {
    return NextResponse.json({ valid: false, error: 'Department not found.' })
  }

  // Look up staff by phone (last 9 digits)
  const { data: staffRows } = await sb
    .from('staff_records')
    .select('id, full_name, subject_specialization, sub_role, phone')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)
    .ilike('phone', `%${digits}`)
    .limit(5)

  if (!staffRows || staffRows.length === 0) {
    return NextResponse.json({ valid: false, error: 'Phone number not found. Contact your HOD.' })
  }

  // Prefer exact name match, fall back to first phone match
  const nameLower = fullName.trim().toLowerCase()
  const staff =
    staffRows.find(s => s.full_name.toLowerCase() === nameLower) ??
    staffRows.find(s => s.full_name.toLowerCase().includes(nameLower.split(' ')[0])) ??
    staffRows[0]

  // Validate subject belongs to department
  const subjects: string[] = dept.subjects ?? []
  const subjectName: string = staff.subject_specialization ?? ''

  if (!subjects.includes(subjectName)) {
    return NextResponse.json({
      valid: false,
      error: `This QR code is for the ${dept.department} department. Please use the correct QR code from your department office.`,
    })
  }

  // Issue 8-hour session token
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()

  await sb.from('teacher_tokens').insert({
    token,
    teacher_id:   staff.id,
    school_id:    SCHOOL_ID,
    subject_name: staff.subject_specialization,
    expires_at:   expiresAt,
    is_active:    true,
    sent_via:     'dept_qr',
  })

  return NextResponse.json({
    valid:          true,
    staffId:        staff.id,
    teacherName:    staff.full_name,
    subjectName:    staff.subject_specialization,
    subRole:        staff.sub_role,
    department:     dept.department,
    departmentCode: dept.code,
    colorPrimary:   dept.color_primary,
    colorSecondary: dept.color_secondary,
    token,
  })
}
