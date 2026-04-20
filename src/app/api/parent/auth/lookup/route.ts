import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/lookup
 * Body: { short_code: string, virtual_qr_id: string }
 *
 * Step 1 of parent login:
 *   - Resolves the school from short_code
 *   - Looks up the student by virtual_qr_id (must belong to that school)
 *   - Returns the masked parent phone number for OTP delivery confirmation
 *   - Does NOT reveal any student personal data
 *
 * Response: { masked_phone: "+254 7** *** 789", school_name: "..." }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { short_code, virtual_qr_id } = body as {
    short_code?: string
    virtual_qr_id?: string
  }

  if (!short_code || !virtual_qr_id) {
    return NextResponse.json(
      { error: 'short_code and virtual_qr_id are required' },
      { status: 400 },
    )
  }

  const svc = createAdminSupabaseClient()

  // Resolve school from short_code
  const { data: school } = await svc
    .from('school_metadata')
    .select('school_id, name')
    .eq('short_code', short_code.toUpperCase())
    .single()

  if (!school) {
    // Intentionally vague — don't confirm whether short_code is valid
    return NextResponse.json({ error: 'QR code not recognised' }, { status: 404 })
  }

  // Look up the QR token
  const { data: token } = await svc
    .from('student_qr_tokens')
    .select('student_id')
    .eq('virtual_qr_id', virtual_qr_id.toUpperCase())
    .eq('school_id', school.school_id)
    .eq('is_active', true)
    .single()

  if (!token) {
    return NextResponse.json({ error: 'QR code not recognised' }, { status: 404 })
  }

  // Find parent phone for this student (from student_parents linking table or students.parent_phone)
  const { data: student } = await svc
    .from('students')
    .select('parent_phone, parent2_phone')
    .eq('id', token.student_id)
    .single()

  if (!student?.parent_phone) {
    return NextResponse.json(
      { error: 'No parent contact registered for this student' },
      { status: 422 },
    )
  }

  // Mask the phone: show first 4 + last 3 digits
  const phone     = student.parent_phone as string
  const masked    = phone.slice(0, 4) + ' ' + '*'.repeat(Math.max(0, phone.length - 7)).replace(/(.{3})/g, '$1 ').trim() + ' ' + phone.slice(-3)

  return NextResponse.json({
    masked_phone: masked,
    school_name:  school.name,
    // session context for next step — not sensitive, but scoped
    _ctx: Buffer.from(JSON.stringify({
      school_id:  school.school_id,
      student_id: token.student_id,
    })).toString('base64'),
  })
}
