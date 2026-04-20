// POST /api/gate/verify — guard verifies student exit (no login, PIN-protected)
// GET  /api/gate/verify?pass_id= — guard looks up pass by admission no + PIN

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Guard accesses this device view with a PIN set by DP admin (separate from student pin)
// For simplicity: guard authenticates with GUARD_ACCESS_PIN env var
const GUARD_PIN = process.env.GUARD_ACCESS_PIN ?? '0000'

export async function POST(req: NextRequest) {
  const db   = svc()
  const body = await req.json() as {
    guard_pin:        string   // device-level guard auth
    student_query:    string   // name or admission number
    exit_pin:         string   // 4-digit PIN from pass
  }

  if (!body.guard_pin || !body.student_query || !body.exit_pin) {
    return NextResponse.json({ error: 'guard_pin, student_query, exit_pin required' }, { status: 400 })
  }

  // Verify guard device PIN
  if (body.guard_pin !== GUARD_PIN) {
    return NextResponse.json({ result: 'INVALID', reason: 'Guard PIN incorrect' }, { status: 401 })
  }

  const now = new Date().toISOString()

  // Find a matching active pass using admission number or name + exit PIN
  const { data: passes } = await db
    .from('gate_passes')
    .select('id, student_id, reason, expected_return, pin_expires_at, exit_pin, status, students(full_name, class_name, admission_number)')
    .eq('status', 'pending')
    .eq('exit_pin', body.exit_pin.trim())
    .gt('pin_expires_at', now)

  if (!passes || passes.length === 0) {
    return NextResponse.json({
      result: 'INVALID',
      reason: 'No active pass found — PIN may be expired or already used',
    })
  }

  // Match student by name or admission number
  const matchingPass = (passes as unknown as {
    id: string; student_id: string; reason: string; expected_return: string;
    pin_expires_at: string; exit_pin: string; status: string;
    students: { full_name: string; class_name: string; admission_number: string | null } | null;
  }[]).find(p => {
    const s = p.students
    if (!s) return false
    const q = body.student_query.toLowerCase().trim()
    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.admission_number ?? '').toLowerCase() === q
    )
  })

  if (!matchingPass) {
    return NextResponse.json({
      result: 'INVALID',
      reason: 'Student name or admission number does not match this exit code',
    })
  }

  // Mark as exited
  await db.from('gate_passes').update({
    status:    'exited',
    exited_at: now,
  }).eq('id', matchingPass.id)

  // Update student status
  await db.from('students').update({ status: 'off_campus' }).eq('id', matchingPass.student_id)

  const s = matchingPass.students!
  const returnFmt = new Date(matchingPass.expected_return).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return NextResponse.json({
    result:          'CLEARED',
    student_name:    s.full_name,
    class_name:      s.class_name,
    admission_number: s.admission_number,
    reason:          matchingPass.reason,
    expected_return: returnFmt,
    exited_at:       new Date(now).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
    pass_id:         matchingPass.id,
  })
}

export async function PATCH(req: NextRequest) {
  // Guard marks student as returned
  const db   = svc()
  const body = await req.json() as { guard_pin: string; pass_id: string }

  if (body.guard_pin !== GUARD_PIN) {
    return NextResponse.json({ error: 'Guard PIN incorrect' }, { status: 401 })
  }

  const { data: pass } = await db
    .from('gate_passes')
    .select('id, student_id, status')
    .eq('id', body.pass_id)
    .single()

  if (!pass || (pass as { status: string }).status !== 'exited') {
    return NextResponse.json({ error: 'Pass not found or not in exited state' }, { status: 404 })
  }

  const now = new Date().toISOString()
  await db.from('gate_passes').update({ status: 'returned', returned_at: now }).eq('id', body.pass_id)
  await db.from('students').update({ status: 'active' }).eq('id', (pass as { student_id: string }).student_id)

  return NextResponse.json({ ok: true, returned_at: now })
}
