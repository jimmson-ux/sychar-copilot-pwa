// GET /api/principal/overview
// Returns aggregated data for the principal dashboard.
// Requires: authenticated session + sub_role = principal (or deputy_principal).

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

const PRINCIPAL_ROLES = new Set(['principal', 'deputy_principal', 'deputy_principal_academics', 'deputy_principal_discipline'])

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, subRole } = auth
  const isPrincipal = subRole === 'principal'
  const hasAccess   = PRINCIPAL_ROLES.has(subRole)

  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = getSb()
  const today = new Date()
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()

  const [
    studentsRes,
    staffRes,
    incidentsTodayRes,
    incidentsWeekRes,
    noticesRes,
    complianceRes,
    aiInsightsRes,
    subscriptionRes,
    feesRes,
  ] = await Promise.all([
    // Total students
    sb.from('students')
      .select('id, gender', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('is_active', true),

    // Teaching staff
    sb.from('staff_records')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_active', true),

    // Discipline incidents today
    sb.from('discipline_records')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .gte('created_at', dayStart),

    // Discipline incidents this week
    sb.from('discipline_records')
      .select('id, severity', { count: 'exact' })
      .eq('school_id', schoolId)
      .gte('created_at', new Date(today.getTime() - 7 * 86400000).toISOString()),

    // Recent notices
    sb.from('notices')
      .select('id, title, content, target_audience, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(5),

    // Document compliance summary
    sb.from('document_compliance')
      .select('id, status, category')
      .eq('school_id', schoolId),

    // AI insights
    sb.from('ai_insights')
      .select('id, insight_type, title, body, severity, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(6),

    // Subscription status
    sb.from('school_subscriptions')
      .select('status, trial_ends_at, sms_used, sms_quota')
      .eq('school_id', schoolId)
      .single(),

    // Fee collection — principal only
    isPrincipal
      ? sb.from('fee_payments')
          .select('amount, payment_date, term')
          .eq('school_id', schoolId)
          .gte('payment_date', new Date(today.getFullYear(), 0, 1).toISOString())
          .order('payment_date', { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null, error: null }),
  ])

  // Compile discipline week severity breakdown
  const weekIncidents = (incidentsWeekRes.data ?? []) as { severity?: string }[]
  const disciplineSummary = {
    total:  incidentsWeekRes.count ?? 0,
    today:  incidentsTodayRes.count ?? 0,
    high:   weekIncidents.filter(r => r.severity === 'high').length,
    medium: weekIncidents.filter(r => r.severity === 'medium').length,
    low:    weekIncidents.filter(r => r.severity === 'low').length,
  }

  // Compliance traffic lights
  type CompRow = { status?: string; category?: string }
  const compRows = (complianceRes.data ?? []) as CompRow[]
  const complianceSummary = {
    green:  compRows.filter(r => r.status === 'compliant').length,
    amber:  compRows.filter(r => r.status === 'pending' || r.status === 'partial').length,
    red:    compRows.filter(r => r.status === 'overdue' || r.status === 'missing').length,
    total:  compRows.length,
  }

  // Fee summary (principal only)
  let feeSummary = null
  if (isPrincipal && feesRes.data) {
    type FeeRow = { amount: number; payment_date: string; term?: string }
    const fees = feesRes.data as FeeRow[]
    const totalCollected = fees.reduce((s, r) => s + (r.amount ?? 0), 0)
    feeSummary = {
      totalCollected,
      transactionCount: fees.length,
      currency: 'KES',
    }
  }

  // Student breakdown
  type StudRow = { gender?: string }
  const studRows = (studentsRes.data ?? []) as StudRow[]
  const studentStats = {
    total:  studentsRes.count ?? 0,
    boys:   studRows.filter(r => r.gender === 'male').length,
    girls:  studRows.filter(r => r.gender === 'female').length,
  }

  const subscription = subscriptionRes.data ?? null

  return NextResponse.json({
    studentStats,
    staffCount:       staffRes.count ?? 0,
    disciplineSummary,
    complianceSummary,
    aiInsights:       aiInsightsRes.data ?? [],
    notices:          noticesRes.data ?? [],
    subscription,
    feeSummary,       // null for non-principals
  })
}
