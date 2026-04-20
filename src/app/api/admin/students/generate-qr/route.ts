import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signStudentQRPayload } from '@/lib/qr/signStudentQR'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/students/generate-qr
 * Body: { student_id: string }
 *
 * Generates (or regenerates) a Virtual QR token for one student.
 * - Deactivates any existing active token first.
 * - Inserts new token with HMAC-signed payload.
 * - Returns { virtual_qr_id, signed_payload }.
 *
 * Auth: staff (principal / HOD / super admin)
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { student_id } = body as { student_id?: string }

  if (!student_id) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Verify student belongs to this school
  const { data: student, error: stuErr } = await svc
    .from('students')
    .select('id, school_id')
    .eq('id', student_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (stuErr || !student) {
    return NextResponse.json({ error: 'Student not found in your school' }, { status: 404 })
  }

  // Fetch school short_code
  const { data: meta } = await svc
    .from('school_metadata')
    .select('short_code')
    .eq('school_id', auth.schoolId)
    .single()

  if (!meta?.short_code) {
    return NextResponse.json({ error: 'School short code not configured' }, { status: 500 })
  }

  // Deactivate existing active token
  await svc
    .from('student_qr_tokens')
    .update({ is_active: false })
    .eq('student_id', student_id)
    .eq('is_active', true)

  // Generate new Virtual QR ID via DB function
  const { data: qrRow, error: qrErr } = await svc
    .rpc('generate_virtual_qr_id') as { data: string | null; error: unknown }

  if (qrErr || !qrRow) {
    return NextResponse.json({ error: 'Failed to generate QR ID' }, { status: 500 })
  }

  const virtualQrId   = qrRow as string
  const signedPayload = await signStudentQRPayload(virtualQrId, meta.short_code)

  const { data: token, error: insertErr } = await svc
    .from('student_qr_tokens')
    .insert({
      school_id:      auth.schoolId,
      student_id:     student_id,
      virtual_qr_id:  virtualQrId,
      signed_payload: signedPayload,
      is_active:      true,
      generated_by:   auth.userId,
    })
    .select('virtual_qr_id, signed_payload, generated_at')
    .single()

  if (insertErr || !token) {
    return NextResponse.json({ error: 'Failed to save QR token' }, { status: 500 })
  }

  return NextResponse.json(token, { status: 201 })
}
