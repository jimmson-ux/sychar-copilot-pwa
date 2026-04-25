// PATCH /api/gate-passes/[id]/return — mark student returned from gate pass

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = new Set(['principal', 'deputy_principal', 'deputy_admin', 'dean', 'security'])

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db  = svc()
  const now = new Date()

  const { data: pass, error: fetchErr } = await db
    .from('gate_passes')
    .select('id, status, expected_return, student_id')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !pass) {
    return NextResponse.json({ error: 'Gate pass not found' }, { status: 404 })
  }

  type PassRow = { id: string; status: string; expected_return: string | null; student_id: string }
  const p = pass as PassRow

  if (p.status !== 'active') {
    return NextResponse.json({ error: `Cannot return pass with status: ${p.status}` }, { status: 409 })
  }

  const isLate = p.expected_return ? now > new Date(p.expected_return) : false
  const newStatus = isLate ? 'late_return' : 'returned'

  const { data, error } = await db
    .from('gate_passes')
    .update({
      actual_return: now.toISOString(),
      status:        newStatus,
    })
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .select('id, status, exit_time, actual_return, expected_return')
    .single()

  if (error) {
    console.error('[gate-passes/return] PATCH error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (isLate) {
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'gate_late_return',
      severity:  'medium',
      title:     `Late return recorded for gate pass ${id.slice(0, 8)}`,
      detail:    { pass_id: id, student_id: p.student_id, actual_return: now.toISOString(), expected_return: p.expected_return },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true, isLate, pass: data })
}
