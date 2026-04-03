import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token.length < 8) {
    return NextResponse.json({ valid: false, error: 'missing_token' }, { status: 400 })
  }

  const admin = getAdmin()

  const { data: tokenRow, error } = await admin
    .from('teacher_tokens')
    .select(`
      id, token, is_active, expires_at, used_count, max_uses,
      teacher_id,
      staff_records!teacher_id (
        id, full_name, email, phone, sub_role, department,
        subject_specialization, assigned_class_name, tsc_number, photo_url
      )
    `)
    .eq('token', token)
    .single()

  if (error || !tokenRow) {
    return NextResponse.json({ valid: false, error: 'invalid' }, { status: 404 })
  }
  if (!tokenRow.is_active) {
    return NextResponse.json({ valid: false, error: 'revoked' }, { status: 403 })
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, error: 'expired' }, { status: 403 })
  }
  if (tokenRow.used_count >= tokenRow.max_uses) {
    return NextResponse.json({ valid: false, error: 'limit_reached' }, { status: 403 })
  }

  // Increment used_count
  await admin
    .from('teacher_tokens')
    .update({ used_count: tokenRow.used_count + 1 })
    .eq('id', tokenRow.id)

  const staff = tokenRow.staff_records as unknown as {
    id: string; full_name: string; email: string; phone: string;
    sub_role: string; department: string;
    subject_specialization: string; assigned_class_name: string;
    tsc_number: string; photo_url: string;
  } | null

  return NextResponse.json({
    valid: true,
    token_id: tokenRow.id,
    expires_at: tokenRow.expires_at,
    uses_remaining: tokenRow.max_uses - tokenRow.used_count - 1,
    teacher: {
      id: staff?.id ?? tokenRow.teacher_id,
      full_name: staff?.full_name ?? '',
      email: staff?.email ?? '',
      phone: staff?.phone ?? '',
      role: staff?.sub_role ?? 'class_teacher',
      department: staff?.department ?? '',
      subject: staff?.subject_specialization ?? '',
      class_name: staff?.assigned_class_name ?? '',
      tsc_number: staff?.tsc_number ?? '',
      photo_url: staff?.photo_url ?? '',
    },
  })
}
