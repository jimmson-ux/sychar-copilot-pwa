import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface CoverCandidate {
  teacherId:   string
  teacherName: string
  ewsScore:    number
  reason:      'Primary cluster' | 'Secondary cluster' | 'General supervision'
  isFree:      boolean
}

// ── Find cover teacher via cascading priority ─────────────────────
// Priority 1: Same cluster, lowest EWS, not teaching that period
// Priority 2: Secondary clusters (teacher is in multiple clusters)
// Priority 3: Any teacher free that period, lowest EWS

export async function findCoverTeacher(payload: {
  absentTeacherId:   string
  timetablePeriodId: string
  dayOfWeek:         number  // 1=Mon … 5=Fri
  periodNumber:      number
  schoolId:          string
}): Promise<{
  candidates:    CoverCandidate[]
  autoSuggested: string | null  // teacher_id of best candidate
}> {
  const admin = getAdmin()

  // Teachers busy that period (on timetable for same day + period_number)
  const { data: busyRows } = await admin
    .from('timetable_periods')
    .select('teacher_id')
    .eq('school_id', payload.schoolId)
    .eq('day_of_week', payload.dayOfWeek)
    .eq('period_number', payload.periodNumber)
    .eq('is_active', true)

  const busyIds = new Set((busyRows ?? []).map((r) => r.teacher_id).filter(Boolean))
  busyIds.delete(payload.absentTeacherId) // already absent, ignore

  // Absent teacher's primary cluster
  const { data: absentMemberships } = await admin
    .from('cluster_members')
    .select('cluster_id, is_cluster_lead')
    .eq('school_id', payload.schoolId)
    .eq('teacher_id', payload.absentTeacherId)

  const primaryClusterId = absentMemberships?.find((m) => m.is_cluster_lead === false)?.cluster_id
    ?? absentMemberships?.[0]?.cluster_id
    ?? null

  const allClusterIds = (absentMemberships ?? []).map((m) => m.cluster_id)

  const candidates: CoverCandidate[] = []

  // ─ Priority 1: Primary cluster ─
  if (primaryClusterId) {
    const { data: clusterPeers } = await admin
      .from('cluster_members')
      .select(`
        teacher_id,
        staff_records!teacher_id ( full_name ),
        teacher_ews!teacher_id ( ews_score )
      `)
      .eq('cluster_id', primaryClusterId)
      .neq('teacher_id', payload.absentTeacherId)

    for (const peer of clusterPeers ?? []) {
      if (busyIds.has(peer.teacher_id)) continue
      const rec = peer as unknown as {
        teacher_id: string
        staff_records: { full_name: string } | null
        teacher_ews: { ews_score: number } | null
      }
      candidates.push({
        teacherId:   rec.teacher_id,
        teacherName: rec.staff_records?.full_name ?? 'Unknown',
        ewsScore:    rec.teacher_ews?.ews_score ?? 0,
        reason:      'Primary cluster',
        isFree:      true,
      })
    }
  }

  // ─ Priority 2: Secondary clusters ─
  if (candidates.length < 3 && allClusterIds.length > 1) {
    const secondaryIds = allClusterIds.filter((id) => id !== primaryClusterId)
    const { data: secondaryPeers } = await admin
      .from('cluster_members')
      .select(`
        teacher_id,
        staff_records!teacher_id ( full_name ),
        teacher_ews!teacher_id ( ews_score )
      `)
      .in('cluster_id', secondaryIds)
      .neq('teacher_id', payload.absentTeacherId)

    for (const peer of secondaryPeers ?? []) {
      if (busyIds.has(peer.teacher_id)) continue
      if (candidates.some((c) => c.teacherId === peer.teacher_id)) continue
      const rec = peer as unknown as {
        teacher_id: string
        staff_records: { full_name: string } | null
        teacher_ews: { ews_score: number } | null
      }
      candidates.push({
        teacherId:   rec.teacher_id,
        teacherName: rec.staff_records?.full_name ?? 'Unknown',
        ewsScore:    rec.teacher_ews?.ews_score ?? 0,
        reason:      'Secondary cluster',
        isFree:      true,
      })
    }
  }

  // ─ Priority 3: Any free teacher, lowest EWS ─
  if (candidates.length === 0) {
    const { data: allTeachers } = await admin
      .from('staff_records')
      .select(`
        id,
        full_name,
        teacher_ews!id ( ews_score )
      `)
      .eq('school_id', payload.schoolId)
      .eq('is_active', true)
      .in('sub_role', [
        'teacher','hod','hod_sciences','hod_humanities','hod_mathematics',
        'hod_languages','hod_technicals','hod_arts',
      ])
      .neq('id', payload.absentTeacherId)

    for (const t of allTeachers ?? []) {
      if (busyIds.has(t.id)) continue
      const rec = t as unknown as {
        id: string
        full_name: string
        teacher_ews: { ews_score: number } | null
      }
      candidates.push({
        teacherId:   rec.id,
        teacherName: rec.full_name,
        ewsScore:    rec.teacher_ews?.ews_score ?? 0,
        reason:      'General supervision',
        isFree:      true,
      })
    }
  }

  // Sort by EWS ascending (lowest workload first)
  candidates.sort((a, b) => a.ewsScore - b.ewsScore)

  return {
    candidates:    candidates.slice(0, 10),
    autoSuggested: candidates[0]?.teacherId ?? null,
  }
}

// ── Assign cover teacher ──────────────────────────────────────────
// Updates timetable_periods + inserts duty_log (EWS trigger fires automatically)
// + pushes notification to covering teacher.

export async function assignCover(payload: {
  timetablePeriodId: string
  coverTeacherId:    string
  absentTeacherId:   string
  assignedBy:        string
  dutyDate:          string   // 'YYYY-MM-DD'
  periodNumber:      number
  schoolId:          string
}): Promise<{ ok: boolean; error?: string }> {
  const admin = getAdmin()

  // 1. Update timetable slot
  const { error: slotErr } = await admin
    .from('timetable_periods')
    .update({
      is_covered:        true,
      covered_by_id:     payload.coverTeacherId,
      cover_assigned_at: new Date().toISOString(),
    })
    .eq('id', payload.timetablePeriodId)
    .eq('school_id', payload.schoolId)

  if (slotErr) return { ok: false, error: slotErr.message }

  // 2. Resolve school_period id for this period_number
  const { data: sp } = await admin
    .from('school_periods')
    .select('id')
    .eq('school_id', payload.schoolId)
    .eq('period_number', payload.periodNumber)
    .maybeSingle()

  // 3. Log duty — EWS trigger fires automatically (weight=2 for ClassCover)
  const { error: dutyErr } = await admin
    .from('duty_log')
    .insert({
      school_id:           payload.schoolId,
      teacher_id:          payload.coverTeacherId,
      duty_type:           'ClassCover',
      complexity_weight:   2,
      duty_date:           payload.dutyDate,
      period_id:           sp?.id ?? null,
      timetable_period_id: payload.timetablePeriodId,
      covering_for_id:     payload.absentTeacherId,
    })

  if (dutyErr) return { ok: false, error: dutyErr.message }

  // 4. Push notification to covering teacher (best-effort)
  await admin.from('pwa_notifications').insert({
    school_id:  payload.schoolId,
    teacher_id: payload.coverTeacherId,
    title:      '📋 Cover Duty Assigned',
    message:    'You have been assigned to cover a class. Check your timetable.',
    type:       'cover_duty',
    url:        '/teacher-dashboard/timetable',
    requires_interaction: true,
  }).then(() => {}, () => {})

  return { ok: true }
}
