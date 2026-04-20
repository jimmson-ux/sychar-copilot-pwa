// GET /api/deputy/shared-stats
// Returns situational awareness data shared by both deputy dashboards.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId } = auth
  const db = serviceClient()
  const today = new Date().toISOString().slice(0, 10)

  const [
    studentsRes,
    staffRes,
    todayLessonsRes,
    disciplineRes,
    rowRes,
    leaveRes,
    proposalsRes,
    pendingProposalsRes,
  ] = await Promise.all([
    db.from('students').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    db.from('staff_records').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true),
    db.from('records_of_work').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('lesson_date', today),
    db.from('discipline_records')
      .select('id, offence_type, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('records_of_work')
      .select('id, subject_name, class_name, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('leave_requests')
      .select('id, leave_type, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('domain_proposals')
      .select('id, action_type, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('domain_proposals')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('status', 'pending'),
  ])

  // Merge activity feed
  const feed: { id: string; type: string; title: string; created_at: string }[] = []

  for (const r of (disciplineRes.data ?? []) as { id: string; offence_type: string; created_at: string }[]) {
    feed.push({ id: r.id, type: 'discipline', title: r.offence_type, created_at: r.created_at })
  }
  for (const r of (rowRes.data ?? []) as { id: string; subject_name: string; class_name: string; created_at: string }[]) {
    feed.push({ id: r.id, type: 'lesson', title: `${r.subject_name} — ${r.class_name}`, created_at: r.created_at })
  }
  for (const r of (leaveRes.data ?? []) as { id: string; leave_type: string; created_at: string }[]) {
    feed.push({ id: r.id, type: 'leave', title: `${r.leave_type} request`, created_at: r.created_at })
  }
  for (const r of (proposalsRes.data ?? []) as { id: string; action_type: string; created_at: string }[]) {
    feed.push({ id: r.id, type: 'proposal', title: r.action_type, created_at: r.created_at })
  }

  feed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const recentActivity = feed.slice(0, 10)

  return NextResponse.json({
    students: studentsRes.count ?? 0,
    staff: staffRes.count ?? 0,
    todayLessons: todayLessonsRes.count ?? 0,
    recentActivity,
    pendingProposals: pendingProposalsRes.count ?? 0,
  })
}
