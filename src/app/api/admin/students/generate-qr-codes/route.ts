import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { signStudentQRPayload } from '@/lib/qr/signStudentQR'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/students/generate-qr-codes
 * Body: { student_ids?: string[] }   — omit to regenerate ALL students in school
 *
 * Bulk generates Virtual QR tokens.
 * - Deactivates existing active tokens for targeted students
 * - Generates new HMAC-signed tokens for each
 * - Returns { generated: number, tokens: [{ student_id, virtual_qr_id }] }
 *
 * Auth: principal or super admin only
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!['principal', 'super_admin', 'admin'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Principal access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { student_ids } = body as { student_ids?: string[] }

  const svc = createAdminSupabaseClient()

  // Fetch school short_code
  const { data: meta } = await svc
    .from('school_metadata')
    .select('short_code')
    .eq('school_id', auth.schoolId)
    .single()

  if (!meta?.short_code) {
    return NextResponse.json({ error: 'School short code not configured' }, { status: 500 })
  }

  // Resolve target student IDs
  let targetIds: string[]
  if (student_ids?.length) {
    // Validate all belong to this school
    const { data: verified } = await svc
      .from('students')
      .select('id')
      .in('id', student_ids)
      .eq('school_id', auth.schoolId)
    targetIds = (verified ?? []).map((s: { id: string }) => s.id)
  } else {
    const { data: all } = await svc
      .from('students')
      .select('id')
      .eq('school_id', auth.schoolId)
      .eq('is_active', true)
    targetIds = (all ?? []).map((s: { id: string }) => s.id)
  }

  if (!targetIds.length) {
    return NextResponse.json({ error: 'No students found' }, { status: 404 })
  }

  // Deactivate all existing active tokens for these students
  await svc
    .from('student_qr_tokens')
    .update({ is_active: false })
    .in('student_id', targetIds)
    .eq('is_active', true)

  // Generate tokens in batches of 50
  const BATCH = 50
  const results: { student_id: string; virtual_qr_id: string }[] = []

  for (let i = 0; i < targetIds.length; i += BATCH) {
    const batch = targetIds.slice(i, i + BATCH)

    // Get new QR IDs from DB function
    const qrIds: string[] = []
    for (const _ of batch) {
      const { data } = await svc.rpc('generate_virtual_qr_id') as { data: string | null; error: unknown }
      qrIds.push(data ?? '')
    }

    const rows = await Promise.all(
      batch.map(async (studentId, idx) => {
        const virtualQrId   = qrIds[idx]
        const signedPayload = await signStudentQRPayload(virtualQrId, meta.short_code as string)
        return {
          school_id:      auth.schoolId,
          student_id:     studentId,
          virtual_qr_id:  virtualQrId,
          signed_payload: signedPayload,
          is_active:      true,
          generated_by:   auth.userId,
        }
      }),
    )

    const { data: inserted } = await svc
      .from('student_qr_tokens')
      .insert(rows)
      .select('student_id, virtual_qr_id')

    results.push(...(inserted ?? []))
  }

  return NextResponse.json({ generated: results.length, tokens: results }, { status: 201 })
}
