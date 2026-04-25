export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ schoolId: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { schoolId } = await params
  const db = adminClient()

  const [schoolRes, studentsRes, staffRes, feesRes] = await Promise.all([
    db.from('schools').select('*').eq('id', schoolId).single(),
    db.from('students').select('id, admission_no, full_name, class_name, stream, is_active').eq('school_id', schoolId).order('full_name'),
    db.from('staff_records').select('user_id, role, sub_role, is_active').eq('school_id', schoolId),
    db.from('fee_balances').select('student_id, balance, last_updated').eq('school_id', schoolId),
  ])

  if (!schoolRes.data) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'export_school_data', entity_type: 'school', entity_id: schoolId,
    meta: { school_name: schoolRes.data.name },
  })

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    school:     schoolRes.data,
    students:   studentsRes.data  ?? [],
    staff:      staffRes.data     ?? [],
    fee_balances: feesRes.data    ?? [],
  })
}
