// POST /api/parent/auth/check
// Body: { phone, schoolCode }
// Checks if a parent phone is registered at the given school.

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
  const body = await req.json().catch(() => ({})) as { phone?: string; schoolCode?: string }

  if (!body.phone?.trim() || !body.schoolCode?.trim()) {
    return NextResponse.json({ error: 'phone and schoolCode required' }, { status: 400 })
  }

  const phone      = normalizePhone(body.phone.trim())
  const schoolCode = body.schoolCode.trim().toUpperCase()
  const svc        = createAdminSupabaseClient()

  // Resolve school from short code
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .eq('school_short_code', schoolCode)
    .single()

  if (!tenant) {
    return NextResponse.json(
      { error: 'School not found. Check your school code.' },
      { status: 404 }
    )
  }

  // Find students linked to this parent phone
  const { data: students } = await svc
    .from('students')
    .select('id, full_name, class_name, current_form')
    .eq('school_id', (tenant as { school_id: string }).school_id)
    .or(`parent_phone.eq.${phone},parent2_phone.eq.${phone}`)
    .eq('is_active', true)

  const studentList = students ?? []

  if (studentList.length === 0) {
    return NextResponse.json({
      found:   false,
      message: 'Phone not registered. Please provide student details to register.',
    })
  }

  return NextResponse.json({
    found:        true,
    schoolId:     (tenant as { school_id: string }).school_id,
    schoolName:   (tenant as { name: string }).name,
    studentCount: studentList.length,
    students:     studentList.map((s: { id: string; full_name: string; class_name: string | null }) => ({
      id: s.id,
      name: s.full_name,
      class: s.class_name,
    })),
  })
}
