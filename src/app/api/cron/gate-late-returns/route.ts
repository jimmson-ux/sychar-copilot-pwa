// GET /api/cron/gate-late-returns — check for overdue gate passes and alert
// Scheduled: */30 * * * * (every 30 minutes)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsApp }            from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db  = svc()
  const now = new Date()

  // All exited passes where expected_return has passed + alert not yet sent
  const { data: overdue } = await db
    .from('gate_passes')
    .select('id, student_id, reason, expected_return, school_id, late_alert_sent, students(full_name, class_name, parent_phone), staff_records!authorized_by(full_name)')
    .eq('status', 'exited')
    .eq('late_alert_sent', false)
    .lt('expected_return', now.toISOString())

  const processed: string[] = []

  for (const pass of (overdue ?? []) as unknown as {
    id: string; student_id: string; reason: string; expected_return: string; school_id: string; late_alert_sent: boolean;
    students: { full_name: string; class_name: string; parent_phone: string | null } | null;
    staff_records: { full_name: string } | null;
  }[]) {
    const s = pass.students
    if (!s) continue

    const minutesLate    = Math.round((now.getTime() - new Date(pass.expected_return).getTime()) / 60000)
    const expectedFmt    = new Date(pass.expected_return).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

    // Determine alert severity by reason and lateness
    const isFeesExit     = pass.reason === 'Fees'
    const isHomeLeave    = pass.reason === 'Authorized Home Leave'
    const isMedical      = pass.reason === 'Medical'

    // Fees: alert if not back by 4 PM
    const hour = new Date().getHours()
    const skipFeesAlert = isFeesExit && hour < 16

    if (skipFeesAlert) continue

    const { data: school } = await db.from('schools').select('name').eq('id', pass.school_id).single()
    const schoolName = (school as { name: string } | null)?.name ?? 'School'

    // ── Alert class teacher + DP admin ─────────────────────────────────────
    await db.from('alerts').insert({
      school_id: pass.school_id,
      type:      'gate_late_return',
      severity:  isHomeLeave || minutesLate > 120 ? 'high' : 'medium',
      title:     `LATE RETURN: ${s.full_name} (${s.class_name}) — ${minutesLate} min overdue — ${pass.reason}`,
      detail:    {
        pass_id:        pass.id,
        student_id:     pass.student_id,
        reason:         pass.reason,
        expected_return: pass.expected_return,
        minutes_late:   minutesLate,
      },
    }).then(() => {}, () => {})

    // ── WhatsApp parent ─────────────────────────────────────────────────────
    if (s.parent_phone) {
      const msg = `*LATE RETURN ALERT — ${schoolName}*\n\n${s.full_name} was expected back at school by ${expectedFmt} and has not yet returned.\n\nReason for exit: ${pass.reason}\n\nPlease ensure your child returns to school promptly or contact the school immediately on ${schoolName} if there is an issue.\n\n_${schoolName}_`
      sendWhatsApp(s.parent_phone, msg).then(() => {}, () => {})
    }

    // ── Medical: if not re-admitted in 48 hours → principal alert ───────────
    if (isMedical && minutesLate > 48 * 60) {
      await db.from('alerts').insert({
        school_id: pass.school_id,
        type:      'gate_medical_not_readmitted',
        severity:  'high',
        title:     `URGENT: ${s.full_name} sent home for Medical — not re-admitted after 48 hours`,
        detail:    { pass_id: pass.id, student_id: pass.student_id },
      }).then(() => {}, () => {})
    }

    // Mark alert sent
    await db.from('gate_passes').update({ late_alert_sent: true }).eq('id', pass.id)
    processed.push(pass.id)
  }

  // ── Also expire stale pending passes (PIN window > 2h, never used) ─────────
  const { data: expiredPending } = await db
    .from('gate_passes')
    .select('id')
    .eq('status', 'pending')
    .lt('pin_expires_at', now.toISOString())

  for (const ep of (expiredPending ?? []) as { id: string }[]) {
    await db.from('gate_passes').update({ status: 'expired' }).eq('id', ep.id)
  }

  return NextResponse.json({
    ok:         true,
    alerted:    processed.length,
    expired:    expiredPending?.length ?? 0,
    checked_at: now.toISOString(),
  })
}
