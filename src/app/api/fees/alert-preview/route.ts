// GET /api/fees/alert-preview
// Returns the list of students who would receive a fee alert
// based on target and min_balance query params.
// Used by the bursar before sending alerts.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set(['accountant','bursar','principal','deputy_principal'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sp         = req.nextUrl.searchParams
  const target     = sp.get('target') ?? 'all'
  const minBalance = target === 'severe' ? 5000
    : parseInt(sp.get('min_balance') ?? '1')

  const db = createAdminSupabaseClient()

  const { data: balances } = await db
    .from('fee_balances')
    .select('student_id,balance')
    .eq('school_id', auth.schoolId)
    .gte('balance', minBalance)
    .order('balance', { ascending: false })

  if (!balances?.length) {
    return NextResponse.json({ students: [], total_outstanding: 0 })
  }

  const ids = balances.map(b => b.student_id)
  const { data: students } = await db
    .from('students')
    .select('id,full_name,admission_no,class_name,stream_name')
    .in('id', ids)

  const preview = (students ?? []).map(s => ({
    ...s,
    balance: balances.find(b => b.student_id === s.id)?.balance ?? 0,
  })).sort((a, b) => b.balance - a.balance)

  return NextResponse.json({
    students:         preview,
    count:            preview.length,
    total_outstanding: preview.reduce((s, x) => s + x.balance, 0),
  })
}
