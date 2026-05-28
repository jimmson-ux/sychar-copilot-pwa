import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/sms'
import { genTempPassword } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

async function getAuthedDb(req: NextRequest) {
  const db    = createAdminSupabaseClient()
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '')
  if (token) {
    const { data: { user } } = await db.auth.getUser(token)
    if (user) return { db, authed: true }
  }
  const sc = await createServerSupabaseClient()
  const { data: { user } } = await sc.auth.getUser()
  return { db, authed: !!user }
}

export async function POST(req: NextRequest) {
  const { db, authed } = await getAuthedDb(req)
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { staff_id: string; school_id: string } | null
  if (!body?.staff_id || !body.school_id) {
    return NextResponse.json({ error: 'staff_id and school_id required' }, { status: 400 })
  }

  const [staffRes, schoolRes] = await Promise.all([
    db.from('staff_records')
      .select('user_id, full_name, phone_number, email')
      .eq('id', body.staff_id)
      .eq('school_id', body.school_id)
      .maybeSingle(),
    db.from('schools').select('name').eq('id', body.school_id).maybeSingle(),
  ])

  const staff  = staffRes.data as any
  const school = schoolRes.data as any

  if (!staff?.user_id) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  const newPassword = genTempPassword(school?.name ?? 'School')

  const { error: authError } = await db.auth.admin.updateUserById(staff.user_id, {
    password: newPassword,
  })
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  if (staff.phone_number) {
    const msg = [
      `Hi ${staff.full_name}, your Sychar password has been reset.`,
      `New password: ${newPassword}`,
      `Login: ${staff.email}`,
      `Change it after logging in.`,
    ].join('\n')
    sendSMS(staff.phone_number, msg).catch(() => {})
  }

  return NextResponse.json({ ok: true, temp_password: newPassword, phone_notified: !!staff.phone_number })
}
