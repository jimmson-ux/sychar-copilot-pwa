// GET /api/bursar/overview
// Bursar + principal only.
// Returns: fee records summary, collection rate, M-Pesa log, term totals.
// NOTE: vote-heads, budget, and payroll are NOT returned here — principal-only endpoints only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['principal', 'bursar'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: bursar or principal only' }, { status: 403 })
  }

  const db      = svc()
  const search  = req.nextUrl.searchParams.get('search') ?? ''
  const term    = req.nextUrl.searchParams.get('term')
  const year    = req.nextUrl.searchParams.get('year')

  const currentMonth = new Date().getMonth() + 1
  const currentTerm  = term ?? String(currentMonth <= 4 ? 1 : currentMonth <= 8 ? 2 : 3)
  const currentYear  = year ?? String(new Date().getFullYear())

  const [feeRes, mpesaRes, studentsRes, alertsRes] = await Promise.all([
    // Fee payments
    db.from('fee_payments')
      .select('id, student_id, student_name, amount, payment_date, receipt_number, payment_method, term, academic_year, balance_after')
      .eq('school_id', auth.schoolId!)
      .eq('term', currentTerm)
      .eq('academic_year', currentYear)
      .order('payment_date', { ascending: false })
      .limit(200),

    // M-Pesa transactions
    db.from('mpesa_transactions')
      .select('id, phone_number, amount, mpesa_ref, description, status, created_at')
      .eq('school_id', auth.schoolId!)
      .order('created_at', { ascending: false })
      .limit(50),

    // Students with outstanding balances
    db.from('students')
      .select('id, full_name, admission_number, class_name, fee_balance')
      .eq('school_id', auth.schoolId!)
      .eq('is_active', true)
      .order('fee_balance', { ascending: true })
      .limit(search ? 100 : 20),

    // Financial alerts for this school
    db.from('alerts')
      .select('id, type, title, severity, created_at')
      .eq('school_id', auth.schoolId!)
      .eq('is_resolved', false)
      .in('type', ['fee_default', 'wallet_zero', 'canteen_bullying'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  type FeeRow = { id: string; student_id: string; student_name: string; amount: number; payment_date: string; receipt_number: string | null; payment_method: string | null; term: string; academic_year: string; balance_after: number | null }
  type StudentRow = { id: string; full_name: string; admission_number: string | null; class_name: string | null; fee_balance: number | null }

  const fees     = (feeRes.data ?? []) as FeeRow[]
  const students = (studentsRes.data ?? []) as StudentRow[]

  // Filter students by search
  const filtered = search
    ? students.filter(s =>
        s.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (s.admission_number ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : students

  const totalCollected = fees.reduce((s, f) => s + (f.amount ?? 0), 0)

  // Expected: term fee × enrolled students (approximation)
  const totalStudents = studentsRes.count ?? students.length
  const TERM_FEE = 15000 // KSH — schools typically configure this; using placeholder
  const expectedTotal  = totalStudents * TERM_FEE
  const collectionRate = expectedTotal > 0 ? Math.round((totalCollected / expectedTotal) * 100) : 0

  // Defaulters: fee_balance > 0
  const defaulters = students.filter(s => (s.fee_balance ?? 0) > 0).length

  return NextResponse.json({
    term:              currentTerm,
    academic_year:     currentYear,
    total_collected:   totalCollected,
    expected_total:    expectedTotal,
    collection_rate:   collectionRate,
    defaulters,
    total_students:    totalStudents,
    recent_payments:   fees.slice(0, 50),
    students:          filtered.slice(0, 50),
    mpesa_log:         mpesaRes.data ?? [],
    alerts:            alertsRes.data ?? [],
  })
}
