import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

async function getUser(req: NextRequest) {
  const db    = createAdminSupabaseClient()
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '')
  if (token) {
    const { data: { user } } = await db.auth.getUser(token)
    if (user) return { db, user }
  }
  const sc = await createServerSupabaseClient()
  const { data: { user } } = await sc.auth.getUser()
  return { db, user }
}

export async function GET(req: NextRequest) {
  const { db, user } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const schoolId = new URL(req.url).searchParams.get('school_id')
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { data: staff, error } = await db
    .from('staff_records')
    .select('id, full_name, sub_role, email, phone_number, user_id, created_at')
    .eq('school_id', schoolId)
    .order('sub_role')
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ staff: staff ?? [] })
}
