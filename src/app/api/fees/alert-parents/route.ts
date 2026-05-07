// POST /api/fees/alert-parents
// Sends fee balance alerts to parents of students with outstanding balances.
// Accountant, bursar, principal only.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set(['accountant','bursar','principal','deputy_principal'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    target?: 'all' | 'severe' | 'custom'
    min_balance?: number
    channels?: { push?: boolean; sms?: boolean }
    custom_message?: string
  }

  const minBalance = body.target === 'severe' ? 5000
    : body.target === 'custom' ? (body.min_balance ?? 0)
    : 1

  const db = createAdminSupabaseClient()

  const { data: balances } = await db
    .from('fee_balances')
    .select('student_id,balance,total_billed,total_paid')
    .eq('school_id', auth.schoolId)
    .gte('balance', minBalance)

  if (!balances?.length) {
    return NextResponse.json({ sent: 0, message: 'No students match the balance criteria' })
  }

  const studentIds = balances.map(b => b.student_id)

  const { data: students } = await db
    .from('students')
    .select('id,full_name,admission_no')
    .in('id', studentIds)

  const defaultMsg = `Dear Parent/Guardian, your child's fee balance is outstanding. Please clear the balance to ensure continued schooling. Contact the school bursar for payment arrangements.`
  const message = body.custom_message?.trim() || defaultMsg

  // Queue push notifications via alerts table
  const alertRows = (students ?? []).map(s => {
    const bal = balances.find(b => b.student_id === s.id)
    return {
      school_id:   auth.schoolId,
      alert_type:  'fee_reminder',
      severity:    (bal?.balance ?? 0) >= 5000 ? 'high' : 'medium',
      title:       `Fee Balance: KES ${bal?.balance?.toLocaleString() ?? 0}`,
      detail:      `${message} Student: ${s.full_name} (${s.admission_no})`,
      target_user: null,
      is_read:     false,
      metadata:    { student_id: s.id, balance: bal?.balance, admission_no: s.admission_no },
    }
  })

  const { error } = await db.from('alerts').insert(alertRows)

  if (error) {
    console.error('[fees/alert-parents]', error.message)
    return NextResponse.json({ error: 'Failed to queue alerts' }, { status: 500 })
  }

  const totalOutstanding = balances.reduce((s, b) => s + (b.balance ?? 0), 0)

  return NextResponse.json({
    sent:             alertRows.length,
    total_outstanding: totalOutstanding,
    message:          `Alerts queued for ${alertRows.length} parents. Total outstanding: KES ${totalOutstanding.toLocaleString()}`,
  })
}
