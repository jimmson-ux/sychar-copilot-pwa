import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

function termRange(): { start: string; end: string; label: string } {
  const now  = new Date()
  const year = now.getFullYear()
  const m    = now.getMonth() + 1
  if (m <= 4)  return { start: `${year}-01-01`, end: `${year}-04-30`, label: `Term 1 ${year}` }
  if (m <= 8)  return { start: `${year}-05-01`, end: `${year}-08-31`, label: `Term 2 ${year}` }
  return       { start: `${year}-09-01`, end: `${year}-12-31`, label: `Term 3 ${year}` }
}

export async function GET(req: Request) {
  const db = createAdminSupabaseClient()
  const url      = new URL(req.url)
  const schoolId = url.searchParams.get('school_id') ?? ''
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const term = termRange()

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    schoolRes, staffRes, studentsRes,
    attendanceRes, syllabusRes, marksRes,
    disciplineRes, suspensionRes, appraisalRes,
    nurseRes, talentRes, feeRes, storeRes,
  ] = await Promise.all([
    db.from('schools').select('name, county, school_metadata').eq('id', schoolId).single(),
    db.from('staff_records').select('id, sub_role, full_name').eq('school_id', schoolId).eq('is_active', true),
    db.from('students').select('id, status, class_name').eq('school_id', schoolId).eq('status', 'active'),
    db.from('attendance_records')
      .select('student_id, status, date')
      .eq('school_id', schoolId)
      .gte('date', term.start).lte('date', term.end),
    db.from('syllabus_progress')
      .select('subject, planned_topics, covered_topics, department')
      .eq('school_id', schoolId),
    db.from('marks')
      .select('student_id, subject, score, max_score')
      .eq('school_id', schoolId)
      .gte('created_at', term.start).lte('created_at', term.end + 'T23:59:59Z'),
    db.from('discipline_incidents')
      .select('id, student_id, class_name, incident_type, department, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', term.start).lte('created_at', term.end + 'T23:59:59Z'),
    db.from('suspension_records')
      .select('id, student_id, status')
      .eq('school_id', schoolId)
      .gte('created_at', term.start),
    db.from('staff_appraisals')
      .select('overall_score, rating')
      .eq('school_id', schoolId)
      .eq('term_id', term.label.replace(/\s/g, '-')),
    db.from('nurse_visits')
      .select('id, visit_type, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', term.start).lte('created_at', term.end + 'T23:59:59Z'),
    db.from('talent_points')
      .select('student_id, category, points')
      .eq('school_id', schoolId),
    db.from('fee_transactions')
      .select('amount, transaction_type, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', term.start).lte('created_at', term.end + 'T23:59:59Z'),
    db.from('store_transactions')
      .select('amount, category, created_at')
      .eq('school_id', schoolId)
      .gte('created_at', term.start).lte('created_at', term.end + 'T23:59:59Z'),
  ])

  const school     = schoolRes.data
  const staff      = staffRes.data ?? []
  const students   = studentsRes.data ?? []
  const attendance = attendanceRes.data ?? []
  const syllabus   = syllabusRes.data ?? []
  const marks      = marksRes.data ?? []
  const discipline = disciplineRes.data ?? []
  const suspensions = suspensionRes.data ?? []
  const appraisals  = appraisalRes.data ?? []
  const nurseVisits = nurseRes.data ?? []
  const talent      = talentRes.data ?? []
  const fees        = feeRes.data ?? []
  const store       = storeRes.data ?? []

  // ── Academic summary ───────────────────────────────────────────────────────
  const totalTopics   = syllabus.reduce((s, r) => s + (r.planned_topics ?? 0), 0)
  const coveredTopics = syllabus.reduce((s, r) => s + (r.covered_topics  ?? 0), 0)
  const syllabusVelocity = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0

  const deptVelocity: Record<string, { planned: number; covered: number }> = {}
  for (const r of syllabus) {
    const dept = r.department ?? 'Other'
    if (!deptVelocity[dept]) deptVelocity[dept] = { planned: 0, covered: 0 }
    deptVelocity[dept].planned += r.planned_topics ?? 0
    deptVelocity[dept].covered += r.covered_topics  ?? 0
  }

  // Top performers (average score ≥ 75%)
  const studentScores: Record<string, { total: number; max: number }> = {}
  for (const m of marks) {
    if (!studentScores[m.student_id]) studentScores[m.student_id] = { total: 0, max: 0 }
    studentScores[m.student_id].total += m.score ?? 0
    studentScores[m.student_id].max   += m.max_score ?? 100
  }
  const topPerformers = Object.entries(studentScores)
    .filter(([, v]) => v.max > 0 && (v.total / v.max) >= 0.75).length
  const atRisk = Object.entries(studentScores)
    .filter(([, v]) => v.max > 0 && (v.total / v.max) < 0.4).length

  // ── Attendance summary ─────────────────────────────────────────────────────
  const studentAttendance = attendance.filter(a => a.status === 'present').length
  const totalAttendance   = attendance.length
  const studentAttRate    = totalAttendance > 0 ? Math.round((studentAttendance / totalAttendance) * 100) : 0

  // ── Discipline summary ─────────────────────────────────────────────────────
  const incidentsByDept: Record<string, number> = {}
  for (const d of discipline) {
    const dept = d.department ?? 'Unknown'
    incidentsByDept[dept] = (incidentsByDept[dept] ?? 0) + 1
  }
  const recidivists = Object.entries(
    discipline.reduce((acc: Record<string, number>, d) => {
      acc[d.student_id] = (acc[d.student_id] ?? 0) + 1; return acc
    }, {})
  ).filter(([, count]) => count > 1).length

  // ── Staffing summary ───────────────────────────────────────────────────────
  const ratingDist: Record<string, number> = { Exceeds: 0, Meeting: 0, Needs: 0, Critical: 0 }
  for (const a of appraisals) {
    if (a.rating) ratingDist[a.rating] = (ratingDist[a.rating] ?? 0) + 1
  }
  const avgAppraisalScore = appraisals.length > 0
    ? Math.round(appraisals.reduce((s, a) => s + (a.overall_score ?? 0), 0) / appraisals.length)
    : null

  // ── Financial summary ──────────────────────────────────────────────────────
  const feePayments  = fees.filter(f => f.transaction_type === 'payment').reduce((s, f) => s + (f.amount ?? 0), 0)
  const storeTotal   = store.reduce((s, f) => s + (f.amount ?? 0), 0)
  const storeByCategory: Record<string, number> = {}
  for (const s of store) {
    const cat = s.category ?? 'Other'
    storeByCategory[cat] = (storeByCategory[cat] ?? 0) + (s.amount ?? 0)
  }

  // ── Health summary ─────────────────────────────────────────────────────────
  const sickBayAdmissions = nurseVisits.filter(v => v.visit_type === 'sick_bay').length
  const outpatientVisits  = nurseVisits.filter(v => v.visit_type === 'outpatient').length

  // ── Talent summary ─────────────────────────────────────────────────────────
  const totalPoints    = talent.reduce((s, t) => s + (t.points ?? 0), 0)
  const uniqueStudents = new Set(talent.map(t => t.student_id)).size
  const catDist: Record<string, number> = {}
  for (const t of talent) {
    catDist[t.category] = (catDist[t.category] ?? 0) + (t.points ?? 0)
  }

  // ── Compliance summary ─────────────────────────────────────────────────────
  const teachingStaff   = staff.filter(s => ['class_teacher','bom_teacher','hod_subjects','hod_sciences','hod_mathematics','hod_languages','hod_humanities','hod_applied_sciences','hod_games_sports'].includes(s.sub_role ?? '')).length

  // ── Build report object ────────────────────────────────────────────────────
  const report = {
    school:       { name: school?.name, county: school?.county },
    term:         term.label,
    generated_at: new Date().toISOString(),
    total_staff:  staff.length,
    total_students: students.length,

    academic: {
      syllabus_velocity: syllabusVelocity,
      dept_velocity: Object.entries(deptVelocity).map(([dept, v]) => ({
        dept,
        velocity: v.planned > 0 ? Math.round((v.covered / v.planned) * 100) : 0,
      })),
      top_performers: topPerformers,
      at_risk: atRisk,
    },

    attendance: {
      student_rate: studentAttRate,
      total_records: totalAttendance,
    },

    discipline: {
      total_incidents: discipline.length,
      suspensions: suspensions.length,
      recidivists,
      by_dept: incidentsByDept,
    },

    staffing: {
      teaching_staff: teachingStaff,
      avg_appraisal_score: avgAppraisalScore,
      rating_distribution: ratingDist,
    },

    financial: {
      fee_collections: feePayments,
      store_spend: storeTotal,
      store_by_category: storeByCategory,
    },

    health: {
      sick_bay_admissions: sickBayAdmissions,
      outpatient_visits:   outpatientVisits,
      total_visits:        nurseVisits.length,
    },

    talent: {
      total_points: totalPoints,
      recognised_students: uniqueStudents,
      by_category: catDist,
    },
  }

  // ── AI narrative (Claude) ──────────────────────────────────────────────────
  let narrative = ''
  try {
    const client = new Anthropic()
    const msg    = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role:    'user',
        content: `You are generating an executive summary for a school Board of Management (BOM) report.
Write exactly 3 concise paragraphs (no headers, no bullet points) summarizing this term's performance data.
Highlight the top 2 achievements and top 2 areas needing attention. Be professional and specific.

Data: ${JSON.stringify({
          school:    report.school.name,
          term:      report.term,
          students:  report.total_students,
          staff:     report.total_staff,
          academic:  report.academic,
          attendance: report.attendance,
          discipline: report.discipline,
          staffing:  report.staffing,
          talent:    report.talent,
        })}`,
      }],
    })
    narrative = (msg.content[0] as { type: string; text: string }).text ?? ''
  } catch {
    narrative = 'AI narrative unavailable — please review the data tables below.'
  }

  // ── SHA-256 integrity hash ─────────────────────────────────────────────────
  const { createHash } = await import('crypto')
  const hash = createHash('sha256').update(JSON.stringify(report)).digest('hex')

  return NextResponse.json({ ...report, narrative, integrity_hash: hash })
}
