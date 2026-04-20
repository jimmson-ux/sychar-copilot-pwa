// GET /api/dean/invigilation-suggestions
// Returns ranked staff suggestions for exam invigilation.
// Query params: date (YYYY-MM-DD), subject, session

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const DEAN_ROLES = ['dean_of_studies', 'deputy_dean_of_studies', 'principal']

interface StaffRow {
  id: string
  full_name: string
  sub_role: string
  department: string | null
  reliability_index: number
}

// Roles that should never be suggested as invigilators
const EXCLUDED_ROLES = [
  'principal',
  'deputy_principal_academics',
  'deputy_principal_academic',
  'deputy_principal_admin',
  'deputy_principal_discipline',
]

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, subRole } = auth

  if (!DEAN_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Dean role required' }, { status: 403 })
  }

  const searchParams = await Promise.resolve(req.nextUrl.searchParams)
  const date    = searchParams.get('date')
  const subject = searchParams.get('subject')
  const session = searchParams.get('session')

  if (!date || !subject || !session) {
    return NextResponse.json(
      { error: 'date, subject, and session are required' },
      { status: 400 }
    )
  }

  const db = serviceClient()

  // Fetch all active teaching staff
  const { data: staffRaw } = await db
    .from('staff_records')
    .select('id, full_name, sub_role, department, reliability_index')
    .eq('school_id', schoolId)
    .eq('is_active', true)

  const allStaff = (staffRaw ?? []) as StaffRow[]

  // Exclude admin/leadership roles
  const teachingStaff = allStaff.filter(s => !EXCLUDED_ROLES.includes(s.sub_role ?? ''))

  // 1. Staff on approved leave on that date
  const { data: leavesRaw } = await db
    .from('leave_requests')
    .select('teacher_id')
    .eq('school_id', schoolId)
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date)

  const onLeaveIds = new Set(
    (leavesRaw ?? []).map((l: { teacher_id: string }) => l.teacher_id)
  )

  // 2. Staff already assigned to invigilation on that date + session
  const { data: existingInvig } = await db
    .from('invigilation_chart')
    .select('invigilator_id')
    .eq('school_id', schoolId)
    .eq('exam_date', date)
    .eq('session', session)

  const alreadyAssignedIds = new Set(
    (existingInvig ?? []).map((e: { invigilator_id: string }) => e.invigilator_id)
  )

  // 3. Staff who teach the subject (cannot invigilate their own subject)
  const { data: timetableRaw } = await db
    .from('timetable')
    .select('teacher_id')
    .eq('school_id', schoolId)
    .eq('subject', subject)
    .not('teacher_id', 'is', null)

  const teachesSubjectIds = new Set(
    (timetableRaw ?? [])
      .map((t: { teacher_id: string | null }) => t.teacher_id)
      .filter(Boolean)
  )

  // 4. Current week lesson load per teacher (proxy for current workload)
  const weekStart = getWeekStart(date)
  const weekEnd   = getWeekEnd(date)

  const { data: rowData } = await db
    .from('records_of_work')
    .select('teacher_id')
    .eq('school_id', schoolId)
    .gte('lesson_date', weekStart)
    .lte('lesson_date', weekEnd)

  const weekLoadMap: Record<string, number> = {}
  for (const r of (rowData ?? []) as { teacher_id: string }[]) {
    weekLoadMap[r.teacher_id] = (weekLoadMap[r.teacher_id] ?? 0) + 1
  }

  // 5. Last invigilation date per teacher (recency score — longer ago = better)
  const { data: invigilationHistory } = await db
    .from('invigilation_chart')
    .select('invigilator_id, exam_date')
    .eq('school_id', schoolId)
    .order('exam_date', { ascending: false })

  const lastInvigMap: Record<string, string> = {}
  for (const row of (invigilationHistory ?? []) as { invigilator_id: string; exam_date: string }[]) {
    if (!lastInvigMap[row.invigilator_id]) {
      lastInvigMap[row.invigilator_id] = row.exam_date
    }
  }

  const today = new Date(date)

  // Score and filter
  const suggestions = teachingStaff
    .filter(s => {
      if (onLeaveIds.has(s.id))          return false
      if (alreadyAssignedIds.has(s.id))  return false
      if (teachesSubjectIds.has(s.id))   return false
      return true
    })
    .map(s => {
      const weekLoad   = weekLoadMap[s.id] ?? 0
      const lastInvig  = lastInvigMap[s.id]
      const daysSince  = lastInvig
        ? Math.floor((today.getTime() - new Date(lastInvig).getTime()) / 86400000)
        : 180 // never invigilated = 6 months ago (high recency score)

      const reliability = s.reliability_index ?? 1.0

      // Composite score: higher = better candidate
      // - Reliability contributes positively
      // - Lesson load this week contributes negatively (busy teachers penalised)
      // - Days since last invig contributes positively (spread fairness)
      const score =
        reliability * 40 +
        Math.min(daysSince, 90) * 0.3 -
        weekLoad * 5

      const reasons: string[] = []
      if (daysSince >= 60)   reasons.push(`Not invigilated in ${daysSince} days`)
      if (weekLoad <= 2)     reasons.push('Light teaching load this week')
      if (reliability >= 1.0) reasons.push('High reliability rating')
      if (weekLoad > 4)      reasons.push(`Note: ${weekLoad} lessons this week`)

      return {
        staffId:       s.id,
        fullName:      s.full_name,
        department:    s.department,
        weekLoad,
        daysSinceLastInvig: daysSince,
        reliabilityIndex: reliability,
        score: Math.round(score * 10) / 10,
        reasons: reasons.length > 0 ? reasons : ['Available and eligible'],
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  return NextResponse.json({
    date,
    subject,
    session,
    suggestions,
  })
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function getWeekEnd(dateStr: string): string {
  const d = new Date(getWeekStart(dateStr))
  d.setDate(d.getDate() + 6)
  return d.toISOString().slice(0, 10)
}
