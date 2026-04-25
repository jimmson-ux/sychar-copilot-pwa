export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const school_id = searchParams.get('school_id')
  const search    = searchParams.get('q')
  const page      = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
  const limit     = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))

  const db = adminClient()
  let query = db
    .from('staff_records')
    .select('user_id, school_id, role, sub_role, is_active, created_at, schools(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1)

  if (school_id) query = query.eq('school_id', school_id)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  type StaffRow = { user_id: string; school_id: string; role: string; sub_role: string | null; is_active: boolean; created_at: string; schools: { name: string } | { name: string }[] | null }

  let users = (data as unknown as StaffRow[]).map(r => ({
    userId:    r.user_id,
    schoolId:  r.school_id,
    schoolName: (r.schools as { name: string } | null)?.name ?? '—',
    role:      r.role,
    subRole:   r.sub_role,
    isActive:  r.is_active,
    createdAt: r.created_at,
  }))

  if (search) {
    const q = search.toLowerCase()
    users = users.filter(u => u.schoolName.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
  }

  return NextResponse.json({ users, total: count ?? 0, page, limit })
}
