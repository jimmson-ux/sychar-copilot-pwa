'use server'

import { createClient } from '@supabase/supabase-js'
import { requireAuth }  from '@/lib/requireAuth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Class aptitude heatmap ────────────────────────────────────────
export async function getClassAptitudeMap(classId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()

  const { data: students } = await admin
    .from('students')
    .select('id, full_name, admission_number')
    .eq('school_id', auth.schoolId)
    .or(`class_id.eq.${classId},class_name.eq.${classId}`)
    .eq('is_active', true)

  if (!students?.length) return { classId, students: [], summary: {} }

  const studentIds = students.map((s) => s.id)

  const { data: aptitudes } = await admin
    .from('student_aptitude')
    .select('student_id, aptitude_group, normalized_aptitude_score, percentile_rank')
    .eq('school_id', auth.schoolId)
    .in('student_id', studentIds)

  const map = new Map((aptitudes ?? []).map((a) => [a.student_id, a]))

  const enriched = students.map((s) => ({
    ...s,
    aptitude: map.get(s.id) ?? {
      aptitude_group: 'Core', normalized_aptitude_score: 0, percentile_rank: null,
    },
  }))

  const summary = {
    Extension: enriched.filter((s) => s.aptitude.aptitude_group === 'Extension').length,
    Core:      enriched.filter((s) => s.aptitude.aptitude_group === 'Core').length,
    Support:   enriched.filter((s) => s.aptitude.aptitude_group === 'Support').length,
    total:     enriched.length,
  }

  return { classId, students: enriched, summary }
}

// ── Support group — needs intervention ───────────────────────────
export async function getAtRiskStudents() {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data, error } = await admin
    .from('student_aptitude')
    .select(`
      student_id, aptitude_group, normalized_aptitude_score, percentile_rank, last_updated,
      students!student_id ( full_name, admission_number, class_name )
    `)
    .eq('school_id', auth.schoolId)
    .eq('aptitude_group', 'Support')
    .order('normalized_aptitude_score', { ascending: true })

  if (error) throw new Error('Failed to fetch at-risk students')
  return { atRisk: data ?? [], count: data?.length ?? 0 }
}

// ── Individual student aptitude profile ──────────────────────────
export async function getStudentAptitude(studentId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()
  const { data } = await admin
    .from('student_aptitude')
    .select('*')
    .eq('school_id', auth.schoolId)
    .eq('student_id', studentId)
    .maybeSingle()

  return data ?? null
}

// ── Manually refresh aptitude for a student ───────────────────────
// Calculates avg score and updates aptitude_group.
export async function refreshStudentAptitude(studentId: string) {
  const auth = await requireAuth()
  if (auth.unauthorized) throw new Error('Unauthorized')

  const admin = getAdmin()

  // Average exam scores for this student
  const { data: scores } = await admin
    .from('exam_results')
    .select('score')
    .eq('school_id', auth.schoolId)
    .eq('student_id', studentId)

  const avg    = scores?.length
    ? (scores.reduce((sum: number, r: { score: number }) => sum + r.score, 0) / scores.length)
    : 0

  const group  = avg >= 80 ? 'Extension' : avg >= 50 ? 'Core' : 'Support'

  const { data, error } = await admin
    .from('student_aptitude')
    .upsert({
      school_id:                auth.schoolId,
      student_id:               studentId,
      normalized_aptitude_score: avg,
      aptitude_group:           group,
      last_updated:             new Date().toISOString(),
    }, { onConflict: 'student_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}
