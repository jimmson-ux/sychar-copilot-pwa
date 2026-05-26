'use server'

import { createClient }       from '@supabase/supabase-js'
import { requireAuth }        from '@/lib/requireAuth'
import { findCoverTeacher,
         assignCover }        from '@/services/coverAllocation'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Cascading cover search ────────────────────────────────────────
export async function getCoverCandidates(
  timetablePeriodId: string,
  absentTeacherId:   string
) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data: slot } = await admin
    .from('timetable_periods')
    .select('day_of_week, period_number')
    .eq('id', timetablePeriodId)
    .eq('school_id', auth.schoolId)
    .maybeSingle()

  if (!slot) throw new Error('Slot not found')

  return findCoverTeacher({
    absentTeacherId,
    timetablePeriodId,
    dayOfWeek:    slot.day_of_week,
    periodNumber: slot.period_number,
    schoolId:     auth.schoolId,
  })
}

// ── Assign cover — deputy action ──────────────────────────────────
export async function assignCoverTeacher(payload: {
  timetablePeriodId: string
  coverTeacherId:    string
  absentTeacherId:   string
  dutyDate:          string
  periodNumber:      number
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const result = await assignCover({
    ...payload,
    assignedBy: auth.userId,
    schoolId:   auth.schoolId,
  })

  if (!result.ok) throw new Error(result.error ?? 'Cover assignment failed')
  return { ok: true }
}

// ── EWS rankings ─────────────────────────────────────────────────
export async function getEWSRankings() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('teacher_ews')
    .select(`
      teacher_id, ews_score, invigilation_count, cover_count,
      gate_duty_count, assembly_duty_count, last_duty_date,
      staff_records!teacher_id ( full_name, department, sub_role )
    `)
    .eq('school_id', auth.schoolId)
    .order('ews_score', { ascending: true })

  if (error) throw new Error('Failed to fetch EWS rankings')
  return data ?? []
}

// ── Cluster management ────────────────────────────────────────────
export async function createCluster(payload: {
  name:        string
  department?: string
  colorCode?:  string
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('clusters')
    .insert({
      school_id:  auth.schoolId,
      name:       payload.name,
      department: payload.department ?? null,
      color_code: payload.colorCode  ?? null,
      created_by: auth.userId,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function addClusterMember(payload: {
  clusterId:     string
  teacherId:     string
  isClusterLead: boolean
}) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('cluster_members')
    .upsert({
      school_id:      auth.schoolId,
      cluster_id:     payload.clusterId,
      teacher_id:     payload.teacherId,
      is_cluster_lead: payload.isClusterLead,
    }, { onConflict: 'cluster_id,teacher_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function getClusters() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data } = await admin
    .from('clusters')
    .select(`
      id, name, department, color_code,
      cluster_members ( teacher_id, is_cluster_lead,
        staff_records!teacher_id ( full_name, sub_role ) )
    `)
    .eq('school_id', auth.schoolId)
    .order('name')

  return data ?? []
}
