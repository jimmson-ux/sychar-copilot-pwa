import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/analytics/parent-engagement — how effectively the school reaches parents:
 * active sessions, notice read-rate, recent query intents, messages. Computed from the
 * DB (PostHog covers fine-grained product analytics per school). Leadership/secretary.
 */
const ALLOWED = new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'secretary', 'bursar'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Leadership only' }, { status: 403 })
  const svc = createAdminSupabaseClient()
  const sid = auth.schoolId
  const since30 = new Date(Date.now() - 30 * 86400e3).toISOString()
  const since7 = new Date(Date.now() - 7 * 86400e3).toISOString()

  const [activeSessions, activeWeek, notices, reads, searches, messages] = await Promise.all([
    svc.from('parent_sessions').select('id', { count: 'exact', head: true }).eq('school_id', sid).eq('is_active', true),
    svc.from('parent_sessions').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('last_seen_at', since7),
    svc.from('notices').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('created_at', since30),
    svc.from('parent_notice_reads').select('notice_id', { count: 'exact', head: true }).gte('read_at', since30),
    svc.from('parent_search_events').select('intent').eq('school_id', sid).gte('created_at', since30).limit(2000),
    svc.from('parent_messages').select('id', { count: 'exact', head: true }).eq('school_id', sid).gte('created_at', since30),
  ])

  // Top query intents (what parents ask about most).
  const intents = (searches.data as { intent: string | null }[] ?? [])
  const intentCounts: Record<string, number> = {}
  for (const r of intents) { const k = r.intent ?? 'other'; intentCounts[k] = (intentCounts[k] ?? 0) + 1 }
  const topIntents = Object.entries(intentCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([intent, count]) => ({ intent, count }))

  return NextResponse.json({
    active_parent_sessions: activeSessions.count ?? 0,
    active_last_7_days: activeWeek.count ?? 0,
    notices_posted_30d: notices.count ?? 0,
    notice_reads_30d: reads.count ?? 0,
    parent_messages_30d: messages.count ?? 0,
    top_query_intents: topIntents,
    note: 'Fine-grained product analytics (funnels, feature adoption) live in each school\'s own PostHog project.',
  })
}
