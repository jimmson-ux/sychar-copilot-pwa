// GET /api/parent/lookup?admission_no=NKR-001&school_code=1834
// Public (no JWT). Gated by admission_no + school_code.
// Rate-limited by IP. Returns parent-safe student snapshot for Groq context.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// ── In-process rate limiter (10 req / min / IP) ──────────────────────────────
const rl = new Map<string, { n: number; reset: number }>()
function allow(ip: string): boolean {
  const now = Date.now()
  const e   = rl.get(ip)
  if (!e || e.reset <= now) { rl.set(ip, { n: 1, reset: now + 60_000 }); return true }
  if (e.n >= 10) return false
  e.n++
  return true
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get('cf-connecting-ip')
          ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          ?? 'unknown'

  if (!allow(ip)) {
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  }

  const sp           = req.nextUrl.searchParams
  const admission_no = sp.get('admission_no')?.trim()
  const school_code  = sp.get('school_code')?.trim()

  if (!admission_no || !school_code) {
    return NextResponse.json({ error: 'admission_no and school_code are required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // 1. Resolve school
  const { data: tenant } = await svc
    .from('tenant_configs')
    .select('school_id, name')
    .eq('school_short_code', school_code.toUpperCase())
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'School not found. Check the school code.' }, { status: 404 })
  }

  type TenantRow = { school_id: string; name: string }
  const t = tenant as TenantRow

  // 2. Resolve student
  const { data: student } = await svc
    .from('students')
    .select('id, full_name, class_name, current_form, stream')
    .eq('school_id', t.school_id)
    .ilike('admission_no', admission_no)
    .eq('is_active', true)
    .maybeSingle()

  if (!student) {
    return NextResponse.json(
      { error: 'Student not found. Check the admission number and school code.' },
      { status: 404 }
    )
  }

  type StudentRow = { id: string; full_name: string; class_name: string | null; current_form: string | null; stream: string | null }
  const s = student as StudentRow

  // 3. Fetch supporting data in parallel
  const cutoff14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [
    { data: feeBalance },
    { data: feeRecords },
    { data: schoolRow },
    { data: attendance },
    { data: marks },
    { data: notices },
  ] = await Promise.all([
    svc.from('fee_balances')
       .select('total_billed, total_paid, balance_due, updated_at')
       .eq('student_id', s.id)
       .maybeSingle(),

    svc.from('fee_records')
       .select('amount_paid, paid_at, term')
       .eq('student_id', s.id)
       .eq('school_id', t.school_id)
       .order('paid_at', { ascending: false })
       .limit(3),

    svc.from('schools')
       .select('paybill_number, name')
       .eq('id', t.school_id)
       .maybeSingle(),

    svc.from('attendance_records')
       .select('date, status')
       .eq('student_id', s.id)
       .eq('school_id', t.school_id)
       .gte('date', cutoff14)
       .order('date', { ascending: false }),

    svc.from('marks')
       .select('raw_score, percentage, grade, exam_type, term, academic_year, subjects(name)')
       .eq('student_id', s.id)
       .order('recorded_at', { ascending: false })
       .limit(8),

    svc.from('notices')
       .select('title, created_at')
       .eq('school_id', t.school_id)
       .order('created_at', { ascending: false })
       .limit(3),
  ])

  type FeeBalRow  = { total_billed: number | null; total_paid: number | null; balance_due: number | null; updated_at: string | null }
  type FeeRecRow  = { amount_paid: number | null; paid_at: string | null; term: string | null }
  type SchoolRow  = { paybill_number: string | null; name: string | null }
  type AttendRow  = { date: string; status: string }
  type MarkRow    = { raw_score: number | null; percentage: number | null; grade: string | null; exam_type: string | null; term: string | null; academic_year: string | null; subjects: { name: string } | null }
  type NoticeRow  = { title: string; created_at: string }

  const fb     = feeBalance as FeeBalRow | null
  const fr     = (feeRecords ?? []) as FeeRecRow[]
  const sc     = schoolRow  as SchoolRow | null
  const attend = (attendance ?? []) as AttendRow[]
  const mks    = (marks ?? []) as MarkRow[]
  const nts    = (notices ?? []) as NoticeRow[]

  const present  = attend.filter(r => r.status === 'present').length
  const absent   = attend.filter(r => r.status === 'absent').length
  const attendRate = attend.length ? Math.round((present / attend.length) * 100) : null

  return NextResponse.json({
    student: {
      full_name:    s.full_name,
      class_name:   s.class_name,
      current_form: s.current_form,
    },
    school: {
      name:           sc?.name ?? t.name,
      paybill_number: sc?.paybill_number ?? null,
    },
    fee: {
      balance_due:     fb?.balance_due   ?? null,
      total_billed:    fb?.total_billed  ?? null,
      total_paid:      fb?.total_paid    ?? null,
      last_payment_at: fb?.updated_at    ?? null,
      recent_payments: fr.map(r => ({
        amount: r.amount_paid,
        date:   r.paid_at,
        term:   r.term,
      })),
    },
    attendance: {
      days_checked: attend.length,
      present,
      absent,
      rate_percent: attendRate,
    },
    marks: mks.map(m => ({
      subject:    (m.subjects as { name: string } | null)?.name ?? null,
      grade:      m.grade,
      percentage: m.percentage,
      exam_type:  m.exam_type,
      term:       m.term,
      year:       m.academic_year,
    })),
    notices: nts.map(n => ({ title: n.title, date: n.created_at.slice(0, 10) })),
  })
}
