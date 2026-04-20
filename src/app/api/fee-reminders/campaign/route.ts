// POST /api/fee-reminders/campaign — principal only
// Sends segmented fee reminder WhatsApp messages to all parents with registered bot sessions.
// Segments: Green (cleared), Yellow (<5k), Orange (5-15k), Red (>15k)
// Red segment: principal also alerted with list for personal follow-up.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as { term?: string; academic_year?: string; dry_run?: boolean }

  const month       = new Date().getMonth() + 1
  const term        = body.term         ?? String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const academicYear= body.academic_year ?? String(new Date().getFullYear())

  // Fetch school info (paybill, term end date)
  const { data: school } = await db
    .from('schools')
    .select('name, paybill_number, term_end_date')
    .eq('id', auth.schoolId!)
    .single()
  const sc = school as { name: string; paybill_number: string | null; term_end_date: string | null } | null
  const paybill  = sc?.paybill_number ?? 'N/A'
  const termEnd  = sc?.term_end_date
    ? new Date(sc.term_end_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'end of term'
  const schoolName = sc?.name ?? 'the school'

  // Fetch all active parent sessions for this school
  const { data: sessions } = await db
    .from('parent_bot_sessions')
    .select('phone, active_student_id')
    .eq('school_id', auth.schoolId!)
    .eq('state', 'active')
    .eq('consent_given', true)
    .not('active_student_id', 'is', null)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ error: 'No registered parents found' }, { status: 404 })
  }

  type SessionRow = { phone: string; active_student_id: string }
  const parentSessions = sessions as SessionRow[]
  const studentIds = [...new Set(parentSessions.map(s => s.active_student_id))]

  // Fetch student fee data
  const { data: students } = await db
    .from('students')
    .select('id, full_name, admission_number, class_name, fee_balance')
    .eq('school_id', auth.schoolId!)
    .in('id', studentIds)

  type StudentRow = { id: string; full_name: string; admission_number: string | null; class_name: string; fee_balance: number | null }
  const studentMap = new Map(((students ?? []) as StudentRow[]).map(s => [s.id, s]))

  // Create campaign record
  const { data: campaign } = await db
    .from('fee_reminder_campaigns')
    .insert({ school_id: auth.schoolId, term, academic_year: academicYear })
    .select('id')
    .single()
  const campaignId = (campaign as { id: string } | null)?.id

  // Segment and send
  const stats = { green: 0, yellow: 0, orange: 0, red: 0, skipped: 0, sent: 0, failed: 0 }
  const redList: Array<{ name: string; class: string; balance: number }> = []

  for (const session of parentSessions) {
    const student = studentMap.get(session.active_student_id)
    if (!student) { stats.skipped++; continue }

    const balance = student.fee_balance ?? 0
    const adm     = student.admission_number ?? ''
    let message: string

    if (balance <= 0) {
      stats.green++
      message = buildMessage('green', student.full_name, balance, paybill, adm, termEnd, schoolName)
    } else if (balance < 5000) {
      stats.yellow++
      message = buildMessage('yellow', student.full_name, balance, paybill, adm, termEnd, schoolName)
    } else if (balance <= 15000) {
      stats.orange++
      message = buildMessage('orange', student.full_name, balance, paybill, adm, termEnd, schoolName)
    } else {
      stats.red++
      redList.push({ name: student.full_name, class: student.class_name, balance })
      message = buildMessage('red', student.full_name, balance, paybill, adm, termEnd, schoolName)
    }

    if (!body.dry_run) {
      const ok = await sendWhatsApp(session.phone, message)
      if (ok) stats.sent++
      else stats.failed++
    } else {
      stats.sent++ // count as sent in dry_run
    }
  }

  // Alert principal about red-segment students
  if (redList.length > 0) {
    const list = redList
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 20)
      .map(r => `• ${r.name} (${r.class}): KSh ${r.balance.toLocaleString('en-KE')}`)
      .join('\n')
    await db.from('alerts').insert({
      school_id: auth.schoolId,
      type:      'fee_campaign_red_segment',
      severity:  'high',
      title:     `${redList.length} student(s) with fee balance > KSh 15,000 — personal follow-up required`,
      detail:    { student_list: redList.slice(0, 20), campaign_id: campaignId },
    }).then(() => {}, () => {})
  }

  // Update campaign stats
  if (campaignId) {
    await db.from('fee_reminder_campaigns').update({
      sent_at: new Date().toISOString(),
      stats,
    }).eq('id', campaignId)
  }

  return NextResponse.json({
    ok:          true,
    campaign_id: campaignId,
    dry_run:     body.dry_run ?? false,
    term,
    academic_year: academicYear,
    stats,
    red_list_count: redList.length,
  })
}

// ── Segment message builders ──────────────────────────────────────────────────

type Segment = 'green' | 'yellow' | 'orange' | 'red'

function buildMessage(
  segment:   Segment,
  name:      string,
  balance:   number,
  paybill:   string,
  adm:       string,
  termEnd:   string,
  schoolName: string
): string {
  const ksh = (n: number) => `KSh ${n.toLocaleString('en-KE')}`

  switch (segment) {
    case 'green':
      return `Dear Parent,\n\nThank you for clearing *${name}*'s fees for this term. We truly appreciate your commitment to ${name}'s education at *${schoolName}*.\n\nHave a wonderful day! 🙏`

    case 'yellow':
      return `Dear Parent,\n\n*${name}*'s fee balance is *${ksh(balance)}*.\n\nKindly clear this balance at your earliest convenience.\n💳 Paybill: *${paybill}*, A/C: *${adm}*\n\n_${schoolName}_`

    case 'orange':
      return `Dear Parent,\n\n*${name}*'s outstanding fee balance is *${ksh(balance)}*.\n\nPlease clear this urgently — balance is due by *${termEnd}*.\n💳 Paybill: *${paybill}*, A/C: *${adm}*\n\nIf experiencing financial difficulties, please contact the school bursar to make arrangements.\n\n_${schoolName}_`

    case 'red':
      return `Dear Parent,\n\n⚠️ *${name}*'s fee balance of *${ksh(balance)}* requires immediate attention.\n\nThis balance is significantly overdue. Please visit the school or contact the bursar urgently.\n💳 Paybill: *${paybill}*, A/C: *${adm}*\n\n_Note: Continued non-payment may affect participation in school activities._\n\n_${schoolName}_`
  }
}
