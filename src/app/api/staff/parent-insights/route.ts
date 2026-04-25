// GET /api/staff/parent-insights
// Aggregated parent query data: topics, sentiment, engagement.
// Role-scoped: class_teacher sees their class only; hod/principal see whole school.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const STAFF_ROLES_FULL = ['principal', 'deputy_principal', 'hod', 'bursar', 'admin']

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token  = authHeader.slice(7)
  const svc    = getAdminClient()

  // Verify staff JWT via Supabase auth
  const { data: { user }, error: authError } = await svc.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data: staff } = await svc
    .from('staff_records')
    .select('school_id, sub_role, class_id')
    .eq('user_id', user.id)
    .single()

  if (!staff) return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })

  type StaffRow = { school_id: string; sub_role: string | null; class_id: string | null }
  const sr = staff as StaffRow

  const p        = req.nextUrl.searchParams
  const days     = Math.min(parseInt(p.get('days') ?? '30', 10), 90)
  const since    = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const isFullView = STAFF_ROLES_FULL.includes(sr.sub_role ?? '')

  let query = svc
    .from('parent_query_logs')
    .select('student_id, context_type, sentiment, topics, language, created_at')
    .eq('school_id', sr.school_id)
    .gte('created_at', since)

  // Class teachers only see queries for students in their class
  if (!isFullView && sr.class_id) {
    const { data: classStudents } = await svc
      .from('students')
      .select('id')
      .eq('class_id', sr.class_id)
      .eq('school_id', sr.school_id)

    const ids = (classStudents ?? []).map((s: { id: string }) => s.id)
    if (ids.length === 0) return NextResponse.json({ total: 0, sentiments: {}, topics: [], engagement: [] })
    query = query.in('student_id', ids)
  }

  const { data: logs, error } = await query.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to load insights' }, { status: 500 })

  const rows = logs ?? []

  // Aggregate sentiments
  const sentiments: Record<string, number> = { concerned: 0, neutral: 0, positive: 0 }
  for (const r of rows) {
    if (r.sentiment in sentiments) sentiments[r.sentiment]++
  }

  // Aggregate topic frequency
  const topicMap = new Map<string, number>()
  for (const r of rows) {
    for (const t of (r.topics as string[] ?? [])) {
      topicMap.set(t, (topicMap.get(t) ?? 0) + 1)
    }
  }
  const topics = Array.from(topicMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }))

  // Daily engagement: count queries per day (last 14 days)
  const engagementMap = new Map<string, number>()
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    engagementMap.set(day, (engagementMap.get(day) ?? 0) + 1)
  }
  const engagement = Array.from(engagementMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([date, count]) => ({ date, count }))

  // Language breakdown
  const langMap = new Map<string, number>()
  for (const r of rows) {
    const lang = r.language ?? 'en'
    langMap.set(lang, (langMap.get(lang) ?? 0) + 1)
  }

  return NextResponse.json({
    total: rows.length,
    period: `${days}d`,
    sentiments,
    topics,
    engagement,
    languages: Object.fromEntries(langMap),
  })
}
