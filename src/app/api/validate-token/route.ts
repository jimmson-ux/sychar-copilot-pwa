import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

let _serviceClient: SupabaseClient | null = null
function getClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _serviceClient
}

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID ?? '68bd8d34-f2f0-4297-bd18-093328824d84'

// Public endpoint — no auth cookie required.
// Supports two modes:
//   ?token=xxx  — WhatsApp magic link (teacher token)
//   ?dept=xxx   — QR scan (department QR token)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token   = searchParams.get('token')
  const deptQr  = searchParams.get('dept')

  // ── dept= mode: QR code scan ────────────────────────────────────────────────
  if (deptQr) {
    const { data: dept } = await getClient()
      .from('department_codes')
      .select('id, department, code, subjects, color_primary, color_secondary, is_active')
      .eq('qr_token', deptQr)
      .single()

    if (!dept || !dept.is_active) {
      return NextResponse.json({ valid: false, error: 'QR code not found or inactive' }, { status: 404 })
    }

    // Counsellor QR → special redirect signal
    if (dept.code === '05C') {
      return NextResponse.json({
        valid: true,
        mode: 'counsellor_qr',
        department: dept.department,
        code: dept.code,
      })
    }

    return NextResponse.json({
      valid: true,
      mode: 'dept_qr',
      deptId:         dept.id,
      department:     dept.department,
      departmentCode: dept.code,
      subjects:       dept.subjects as string[],
      colorPrimary:   dept.color_primary,
      colorSecondary: dept.color_secondary,
    })
  }

  if (!token || token.length < 8) {
    return NextResponse.json({ valid: false, error: 'Missing token' }, { status: 400 })
  }

  // Sanitise: token column is plain text, no SQL involved — just a parameterised eq()
  const { data, error } = await getClient()
    .from('teacher_tokens')
    .select(`
      id,
      class_name,
      subject_name,
      expires_at,
      is_active,
      used_count,
      max_uses,
      staff_records!teacher_id ( full_name )
    `)
    .eq('token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ valid: false, error: 'Token not found' }, { status: 404 })
  }

  if (!data.is_active) {
    return NextResponse.json({ valid: false, error: 'Token is inactive' }, { status: 403 })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'Token has expired' }, { status: 403 })
  }

  if (data.used_count >= data.max_uses) {
    return NextResponse.json({ valid: false, error: 'Token has reached its usage limit' }, { status: 403 })
  }

  const staffRecord = data.staff_records as unknown as { full_name: string } | null

  return NextResponse.json({
    valid: true,
    tokenId: data.id,
    teacherName: staffRecord?.full_name ?? null,
    className: data.class_name,
    subjectName: data.subject_name,
  })
}
