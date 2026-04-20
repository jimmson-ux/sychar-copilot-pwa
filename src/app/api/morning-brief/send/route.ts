// GET /api/morning-brief/send
// Called by Vercel Cron at 4:30 AM UTC (7:30 AM EAT) on school days (Mon–Fri).
// Compiles a structured morning brief from all modules and WhatsApps it to the principal.
// Protected by x-cron-secret header.
//
// Principal can reply: DETAIL FEES | DETAIL STORE | DETAIL ABSENT | DETAIL PENDING | APPROVE [ref]
// Those replies are handled in /api/whatsapp/webhook → lib/bot/handlers.ts handlePrincipalReply()

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db      = svc()
  const results: Array<{ school_id: string; principal_phone: string; ok: boolean }> = []

  // Fetch all active schools with a principal phone on record
  const { data: principals } = await db
    .from('staff_records')
    .select('school_id, phone, full_name')
    .eq('sub_role', 'principal')
    .eq('is_active', true)
    .not('phone', 'is', null)

  if (!principals || principals.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No principals with phone numbers found' })
  }

  for (const p of principals) {
    const principal = p as { school_id: string; phone: string; full_name: string }
    try {
      const brief = await compileBrief(principal.school_id, principal.full_name, db)
      const ok    = await sendWhatsApp(principal.phone, brief)
      results.push({ school_id: principal.school_id, principal_phone: principal.phone, ok })
    } catch (err) {
      console.error(`[MorningBrief] Error for school ${principal.school_id}:`, err)
      results.push({ school_id: principal.school_id, principal_phone: principal.phone, ok: false })
    }
  }

  return NextResponse.json({ ok: true, sent: results.filter(r => r.ok).length, results })
}

// ── Compile the morning brief ─────────────────────────────────────────────────

async function compileBrief(schoolId: string, principalName: string, db: ReturnType<typeof svc>): Promise<string> {
  const today     = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  const todayStr  = today.toISOString().split('T')[0]
  const yestStr   = yesterday.toISOString().split('T')[0]

  const [
    attendanceRes,
    sickBayRes,
    storeAlertRes,
    feeYesterdayRes,
    feeTermRes,
    pendingReqRes,
    pendingDisciplineRes,
    todOnDutyRes,
    todayEventsRes,
    totalStudentsRes,
    teacherAbsenceRes,
  ] = await Promise.all([
    // Yesterday student attendance
    db.from('attendance_records')
      .select('status', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('date', yestStr),

    // Sick bay yesterday
    db.from('sick_bay_visits')
      .select('id, status', { count: 'exact' })
      .eq('school_id', schoolId)
      .gte('visit_date', yestStr + 'T00:00:00Z')
      .lte('visit_date', yestStr + 'T23:59:59Z'),

    // Store items below threshold
    db.from('inventory_items')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .filter('current_stock', 'lte', 'reorder_level'),

    // Fee collections yesterday
    db.from('fee_payments')
      .select('amount')
      .eq('school_id', schoolId)
      .gte('payment_date', yestStr)
      .lte('payment_date', yestStr),

    // Term fee total
    db.from('fee_payments')
      .select('amount')
      .eq('school_id', schoolId)
      .eq('academic_year', String(today.getFullYear()))
      .eq('term', String(today.getMonth() + 1 <= 4 ? 1 : today.getMonth() + 1 <= 8 ? 2 : 3)),

    // Pending requisitions
    db.from('requisitions')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('status', 'pending'),

    // Pending discipline review
    db.from('discipline_records')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('status', 'pending_review'),

    // Teacher on duty today
    db.from('teacher_on_duty')
      .select('staff_records(full_name, class_name)')
      .eq('school_id', schoolId)
      .eq('duty_date', todayStr)
      .single(),

    // Today's calendar events
    db.from('school_calendar')
      .select('title, event_time, category')
      .eq('school_id', schoolId)
      .eq('event_date', todayStr)
      .order('event_time'),

    // Total enrolled students (for attendance %)
    db.from('students')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('is_active', true),

    // Teacher absences today
    db.from('attendance_records')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('date', yestStr)
      .eq('record_type', 'teacher')
      .eq('status', 'absent'),
  ])

  // ── Attendance ──────────────────────────────────────────────────────────
  const totalStudents = totalStudentsRes.count ?? 0
  const attRecords    = (attendanceRes.data ?? []) as { status: string }[]
  const presentCount  = attRecords.filter(r => r.status === 'present').length
  const attPct        = totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0
  const absentCount   = totalStudents - presentCount
  const teacherAbsent = teacherAbsenceRes.count ?? 0

  // ── Sick bay ────────────────────────────────────────────────────────────
  const sickVisits    = sickBayRes.count ?? 0
  const sickRecords   = (sickBayRes.data ?? []) as { status: string }[]
  const currentlyAdmitted = sickRecords.filter(r => r.status === 'admitted').length
  const sentHome      = sickRecords.filter(r => r.status === 'sent_home').length

  // ── Store ───────────────────────────────────────────────────────────────
  const storeAlerts = storeAlertRes.count ?? 0

  // ── Fees ────────────────────────────────────────────────────────────────
  const feeYesterday = ((feeYesterdayRes.data ?? []) as { amount: number }[]).reduce((s, f) => s + f.amount, 0)
  const feeTerm      = ((feeTermRes.data    ?? []) as { amount: number }[]).reduce((s, f) => s + f.amount, 0)
  const TERM_FEE_EST = totalStudents * 15000
  const termPct      = TERM_FEE_EST > 0 ? Math.round((feeTerm / TERM_FEE_EST) * 100) : 0

  // ── Pending ─────────────────────────────────────────────────────────────
  const pendingReq  = pendingReqRes.count ?? 0
  const pendingDisc = pendingDisciplineRes.count ?? 0
  const totalPending = pendingReq + pendingDisc

  // ── TOD ─────────────────────────────────────────────────────────────────
  const todData = (todOnDutyRes.data as { staff_records: { full_name: string; class_name: string } | null } | null)
  const todName = todData?.staff_records?.full_name ?? 'Not assigned'
  const todClass = todData?.staff_records?.class_name ?? ''

  // ── Today's events ───────────────────────────────────────────────────────
  const events = (todayEventsRes.data ?? []) as { title: string; event_time: string | null; category: string }[]
  const eventLines = events.length > 0
    ? events.map(e => `  • ${e.event_time ? e.event_time.slice(0, 5) + ' ' : ''}${e.title}`).join('\n')
    : '  No special events'

  // ── Format ───────────────────────────────────────────────────────────────
  const dateStr = today.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const ksh = (n: number) => `KSh ${n.toLocaleString('en-KE')}`

  const attIcon  = attPct >= 90 ? '✅' : attPct >= 75 ? '⚠️' : '🔴'
  const feeIcon  = termPct >= 70 ? '✅' : termPct >= 50 ? '⚠️' : '🔴'
  const storeIcon = storeAlerts === 0 ? '✅' : '⚠️'

  const brief = [
    `🏫 *MORNING BRIEF — ${dateStr}*`,
    `Good morning, ${principalName.split(' ')[0]}.`,
    ``,
    `${attIcon} *ATTENDANCE (Yesterday)*`,
    `Students: *${attPct}%* present (${absentCount} absent of ${totalStudents})`,
    teacherAbsent > 0 ? `Teachers absent: *${teacherAbsent}*` : `Teachers: All present`,
    ``,
    `🏥 *SICK BAY*`,
    `Visits yesterday: ${sickVisits} | Admitted: ${currentlyAdmitted} | Sent home: ${sentHome}`,
    ``,
    `${storeIcon} *STORE*`,
    storeAlerts > 0 ? `⚠️ *${storeAlerts}* item(s) below reorder threshold` : `All items above threshold`,
    ``,
    `${feeIcon} *FEES*`,
    `Yesterday collections: *${ksh(feeYesterday)}*`,
    `Term total: *${ksh(feeTerm)}* (${termPct}% of estimated ${ksh(TERM_FEE_EST)})`,
    ``,
    `📋 *PENDING ACTIONS* — ${totalPending} item(s)`,
    totalPending > 0
      ? `Requisitions: ${pendingReq} | Discipline: ${pendingDisc}`
      : `Nothing pending`,
    ``,
    `👮 *TEACHER ON DUTY*`,
    `${todName}${todClass ? ` — ${todClass}` : ''}`,
    ``,
    `📅 *TODAY'S EVENTS*`,
    eventLines,
    ``,
    `─────────────────────────────`,
    `Reply: *DETAIL FEES* | *DETAIL STORE* | *DETAIL ABSENT* | *DETAIL PENDING* | *APPROVE [ref]*`,
  ].join('\n')

  return brief
}
