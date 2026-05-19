// GET /api/principal/school-health
// Returns 7-area school health snapshot for the principal executive summary.
// Requires: authenticated session + sub_role in PRINCIPAL_ROLES.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

const PRINCIPAL_ROLES = new Set(['principal', 'deputy_principal', 'deputy_principal_academics', 'deputy_principal_discipline'])
const BOM_TARGET = 250

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function composeSummary(s: {
  date: string; enrolment: number; collectionPct: number;
  meanScore: number | null; bomTarget: number; staffingGaps: number; maintenanceIssues: number;
}): string {
  const dateStr = new Date(s.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })
  const score = s.meanScore != null ? s.meanScore.toFixed(1) : 'N/A'
  return (
    `As of ${dateStr}, the school has ${s.enrolment.toLocaleString('en-KE')} students enrolled ` +
    `with a fee collection rate of ${s.collectionPct}%. ` +
    `The academic mean score stands at ${score} against a BOM target of ${s.bomTarget}. ` +
    `${s.staffingGaps} staffing gap${s.staffingGaps !== 1 ? 's have' : ' has'} been identified ` +
    `requiring urgent TSC action. ${s.maintenanceIssues} maintenance issue${s.maintenanceIssues !== 1 ? 's' : ''} remain open.`
  )
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, subRole } = auth
  if (!PRINCIPAL_ROLES.has(subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = getSb()
  const today = new Date()

  const [
    studentsRes,
    voteHeadsRes,
    staffAllRes,
    staffTSCRes,
    staffGapsRes,
    meritRes,
    disciplineRes,
    suspensionRes,
    lpoRes,
    termRes,
  ] = await Promise.all([
    sb.from('students').select('gender').eq('school_id', schoolId).eq('is_active', true),
    sb.from('fee_balances').select('invoiced_amount, paid_amount').eq('school_id', schoolId),
    sb.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true),
    sb.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true).eq('employment_type', 'tsc'),
    sb.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true).neq('employment_type', 'tsc'),
    sb.from('merit_list').select('total_marks').eq('school_id', schoolId).limit(500),
    sb.from('discipline_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'open'),
    sb.from('suspension_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'approved'),
    sb.from('procurement_documents').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('document_type', 'lpo').in('workflow_status', ['pending_verification', 'pending_approval']),
    sb.from('term_structures').select('open_date, close_date').eq('school_id', schoolId).lte('open_date', today.toISOString()).gte('close_date', today.toISOString()).limit(1).maybeSingle(),
  ])

  // Enrolment
  type GenderRow = { gender?: string }
  const students = (studentsRes.data ?? []) as GenderRow[]
  const enrolment = students.length
  const boys  = students.filter(s => { const g = String(s.gender ?? '').toLowerCase(); return g.startsWith('m') || g === 'boy' }).length
  const girls = students.filter(s => { const g = String(s.gender ?? '').toLowerCase(); return g.startsWith('f') || g === 'girl' }).length

  // Fee health — fee_balances: invoiced_amount = total billed, paid_amount = total collected
  type FeeBalRow = { invoiced_amount?: number | string; paid_amount?: number | string }
  const feeRows = (voteHeadsRes.data ?? []) as FeeBalRow[]
  const totalExpectedKES = feeRows.reduce((s, v) => s + Number(v.invoiced_amount ?? 0), 0)
  const totalReceivedKES = feeRows.reduce((s, v) => s + Number(v.paid_amount ?? 0), 0)
  const collectionPct = totalExpectedKES > 0 ? Math.round((totalReceivedKES / totalExpectedKES) * 100) : 0

  // Staff
  const staffTotal  = staffAllRes.count  ?? 0
  const staffTSC    = staffTSCRes.count  ?? 0
  const staffingGaps = staffGapsRes.count ?? 0

  // Performance
  type MeritRow = { total_marks?: number | string }
  const merits = (meritRes.data ?? []) as MeritRow[]
  const meanScore = merits.length > 0
    ? Math.round((merits.reduce((s, m) => s + Number(m.total_marks ?? 0), 0) / merits.length) * 10) / 10
    : null

  // Discipline + suspensions
  const openDiscipline    = disciplineRes.count  ?? 0
  const activeSuspensions = suspensionRes.count  ?? 0

  // Maintenance
  const maintenanceIssues = lpoRes.count ?? 0

  // Calendar
  type TermRow = { open_date?: string; close_date?: string }
  const term = termRes.data as TermRow | null
  const daysRemaining = term?.close_date
    ? Math.max(0, Math.ceil((new Date(term.close_date).getTime() - today.getTime()) / 86_400_000))
    : null

  const partial = { date: today.toISOString(), enrolment, boys, girls, collectionPct, totalExpectedKES: Math.round(totalExpectedKES), totalReceivedKES: Math.round(totalReceivedKES), staffTotal, staffTSC, staffingGaps, meanScore, bomTarget: BOM_TARGET, openDiscipline, activeSuspensions, maintenanceIssues, daysRemaining }

  const snapshot = { ...partial, summaryText: composeSummary(partial) }

  const queryErrors = [studentsRes, voteHeadsRes, staffAllRes, staffTSCRes, staffGapsRes, meritRes, disciplineRes, suspensionRes, lpoRes]
    .filter(r => r.error)
    .map(r => r.error?.message)
  if (queryErrors.length > 0) {
    console.error('[school-health] partial query failures:', queryErrors)
  }

  return NextResponse.json(snapshot)
}
