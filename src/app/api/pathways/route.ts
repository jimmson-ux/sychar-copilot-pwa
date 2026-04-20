// GET /api/pathways
// Gender × STEM performance and pathway inclination data for the pathways dashboard.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
// ── KCPE → CBC pathway recommendation ────────────────────────────────────────
// Kenyan KCPE is out of 500 (5 subjects × 100)
// National grade thresholds (approximate):
//   A  ≥ 400 | B 320–399 | C 260–319 | D 200–259 | E < 200
function kcpeToPathway(marks: number | null): 'STEM' | 'Social_Sciences' | 'Arts_Sports' | 'CBE' {
  if (marks === null) return 'CBE'
  if (marks >= 310) return 'STEM'
  if (marks >= 230) return 'Social_Sciences'
  return 'Arts_Sports'
}

function kcpeToGradeBand(marks: number | null): string {
  if (marks === null) return 'CBE / No KCPE'
  if (marks >= 400) return 'A (400+)'
  if (marks >= 320) return 'B (320–399)'
  if (marks >= 260) return 'C (260–319)'
  if (marks >= 200) return 'D (200–259)'
  return 'E (<200)'
}

// ── helpers ───────────────────────────────────────────────────────────────────
const avg = (arr: number[]) =>
  arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null

const pct = (n: number, total: number) =>
  total > 0 ? Math.round((n / total) * 1000) / 10 : 0

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getClient()
  const SCHOOL_ID = auth.schoolId

  try {
    const [
      { data: students, error: studErr },
      { data: marks,    error: markErr },
      { data: subjects, error: subErr  },
      { data: streams,  error: strErr  },
      { data: classes,  error: clsErr  },
    ] = await Promise.all([
      sb.from('students')
        .select('id,gender,kcpe_marks,kcpe_grade,stream_name,class_id,curriculum_type')
        .eq('school_id', SCHOOL_ID)
        .eq('is_active', true),

      sb.from('marks')
        .select('student_id,subject_id,percentage,grade,class_id,academic_year,term'),

      sb.from('subjects')
        .select('id,name,code,category,pathway,department,curriculum_type')
        .eq('school_id', SCHOOL_ID)
        .eq('is_active', true)
        .order('category')
        .order('name'),

      sb.from('streams')
        .select('id,name,colour_hex,sort_order')
        .eq('school_id', SCHOOL_ID)
        .order('sort_order'),

      sb.from('classes')
        .select('id,name,stream_id,year_group,curriculum_type')
        .eq('school_id', SCHOOL_ID),
    ])

    if (studErr) throw new Error('students: ' + studErr.message)
    if (markErr) throw new Error('marks: ' + markErr.message)
    if (subErr)  throw new Error('subjects: ' + subErr.message)
    if (strErr)  throw new Error('streams: ' + strErr.message)
    if (clsErr)  throw new Error('classes: ' + clsErr.message)

    // ── Lookup maps ───────────────────────────────────────────────────────────
    const subjectMap  = new Map((subjects ?? []).map(s => [s.id, s]))
    const streamMap   = new Map((streams  ?? []).map(s => [s.id, s]))
    const classMap    = new Map((classes  ?? []).map(c => [c.id, c]))
    const studentMap  = new Map((students ?? []).map(s => [s.id, s]))

    const ss = students ?? []
    const ms = marks    ?? []

    // ── 1. Overview gender breakdown ──────────────────────────────────────────
    const female = ss.filter(s => s.gender === 'female')
    const male   = ss.filter(s => s.gender === 'male')

    const femaleKcpe = female.map(s => s.kcpe_marks).filter((v): v is number => v !== null)
    const maleKcpe   = male.map(s => s.kcpe_marks).filter((v): v is number => v !== null)

    const gradeCount = (arr: typeof ss) => {
      const dist: Record<string, number> = {}
      for (const s of arr) {
        const band = kcpeToGradeBand(s.kcpe_marks)
        dist[band] = (dist[band] ?? 0) + 1
      }
      return dist
    }

    // ── 2. Gender × stream breakdown ──────────────────────────────────────────
    type StreamBucket = {
      stream_id: string
      stream_name: string
      colour_hex: string
      female: { count: number; kcpe: number[]; cbe: number }
      male:   { count: number; kcpe: number[]; cbe: number }
    }
    const streamBuckets = new Map<string, StreamBucket>()

    for (const stream of streams ?? []) {
      streamBuckets.set(stream.name, {
        stream_id:   stream.id,
        stream_name: stream.name,
        colour_hex:  stream.colour_hex,
        female: { count: 0, kcpe: [], cbe: 0 },
        male:   { count: 0, kcpe: [], cbe: 0 },
      })
    }

    for (const s of ss) {
      const key = s.stream_name ?? ''
      const b = streamBuckets.get(key)
      if (!b) continue
      const gender = s.gender === 'female' ? 'female' : 'male'
      b[gender].count++
      if (s.kcpe_marks !== null) b[gender].kcpe.push(s.kcpe_marks)
      else b[gender].cbe++
    }

    const streamData = [...streamBuckets.values()].map(b => ({
      stream_id:       b.stream_id,
      stream_name:     b.stream_name,
      colour_hex:      b.colour_hex,
      female_count:    b.female.count,
      male_count:      b.male.count,
      total:           b.female.count + b.male.count,
      female_pct:      pct(b.female.count, b.female.count + b.male.count),
      female_avg_kcpe: avg(b.female.kcpe),
      male_avg_kcpe:   avg(b.male.kcpe),
      female_cbe:      b.female.cbe,
      male_cbe:        b.male.cbe,
    }))

    // ── 3. Pathway inclination from KCPE bands ────────────────────────────────
    type PathwayKey = 'STEM' | 'Social_Sciences' | 'Arts_Sports' | 'CBE'
    const pathwayBuckets: Record<PathwayKey, { female: number; male: number }> = {
      STEM:            { female: 0, male: 0 },
      Social_Sciences: { female: 0, male: 0 },
      Arts_Sports:     { female: 0, male: 0 },
      CBE:             { female: 0, male: 0 },
    }

    for (const s of ss) {
      const pw  = kcpeToPathway(s.kcpe_marks)
      const gen = s.gender === 'female' ? 'female' : 'male'
      pathwayBuckets[pw][gen]++
    }

    const pathwayInclination = (Object.entries(pathwayBuckets) as [PathwayKey, { female: number; male: number }][]).map(
      ([pathway, counts]) => ({
        pathway,
        label:        pathway.replace(/_/g, ' & '),
        female_count: counts.female,
        male_count:   counts.male,
        total:        counts.female + counts.male,
        female_pct:   pct(counts.female, female.length),
        male_pct:     pct(counts.male,   male.length),
      })
    )

    // ── 4. KCPE grade band breakdown by gender ────────────────────────────────
    const bandOrder = ['A (400+)', 'B (320–399)', 'C (260–319)', 'D (200–259)', 'E (<200)', 'CBE / No KCPE']
    const femaleBands = gradeCount(female)
    const maleBands   = gradeCount(male)

    const gradeBands = bandOrder.map(band => ({
      band,
      female_count: femaleBands[band] ?? 0,
      male_count:   maleBands[band]   ?? 0,
    }))

    // ── 5. Marks by gender × subject category ────────────────────────────────
    type MarkBucket = {
      category: string
      gender:   string
      pcts:     number[]
      count:    number
    }
    const markBuckets = new Map<string, MarkBucket>()

    for (const m of ms) {
      const sub = subjectMap.get(m.subject_id)
      if (!sub) continue
      const stu = studentMap.get(m.student_id)
      if (!stu) continue
      const cat = sub.category ?? 'unknown'
      const gen = stu.gender === 'female' ? 'female' : 'male'
      const key = `${cat}|${gen}`
      if (!markBuckets.has(key)) markBuckets.set(key, { category: cat, gender: gen, pcts: [], count: 0 })
      const b = markBuckets.get(key)!
      b.count++
      if (m.percentage !== null) b.pcts.push(m.percentage)
    }

    const marksByCategory = [...markBuckets.values()].map(b => ({
      category:   b.category,
      gender:     b.gender,
      count:      b.count,
      avg_pct:    avg(b.pcts),
    }))

    // ── 6. Core STEM subjects: marks by gender per subject ────────────────────
    const CORE_STEM_NAMES = [
      'Mathematics', 'Biology', 'Chemistry', 'Physics',
      'Agriculture', 'Computer Studies', 'Home Science',
    ]
    const isCoreSTEM = (name: string) => CORE_STEM_NAMES.some(c => name.startsWith(c))

    type SubjectBucket = { subject_id: string; name: string; dept: string; female: number[]; male: number[] }
    const subjectBuckets = new Map<string, SubjectBucket>()

    for (const m of ms) {
      const sub = subjectMap.get(m.subject_id)
      if (!sub || !isCoreSTEM(sub.name)) continue
      const stu = studentMap.get(m.student_id)
      if (!stu || m.percentage === null) continue
      if (!subjectBuckets.has(m.subject_id)) {
        subjectBuckets.set(m.subject_id, {
          subject_id: m.subject_id, name: sub.name, dept: sub.department, female: [], male: [],
        })
      }
      const b = subjectBuckets.get(m.subject_id)!
      if (stu.gender === 'female') b.female.push(m.percentage)
      else b.male.push(m.percentage)
    }

    const subjectMarks = [...subjectBuckets.values()].map(b => ({
      subject_id:   b.subject_id,
      name:         b.name,
      dept:         b.dept,
      female_avg:   avg(b.female),
      male_avg:     avg(b.male),
      female_count: b.female.length,
      male_count:   b.male.length,
      gap:          avg(b.female) !== null && avg(b.male) !== null
                      ? Math.round((avg(b.female)! - avg(b.male)!) * 10) / 10
                      : null,
    }))

    // ── 7. Subjects list (categorised for the UI) ─────────────────────────────
    const subjectsByCategory: Record<string, typeof subjects> = {}
    for (const s of subjects ?? []) {
      if (!subjectsByCategory[s.category]) subjectsByCategory[s.category] = []
      subjectsByCategory[s.category].push(s)
    }

    return NextResponse.json({
      overview: {
        total:            ss.length,
        female_count:     female.length,
        male_count:       male.length,
        female_avg_kcpe:  avg(femaleKcpe),
        male_avg_kcpe:    avg(maleKcpe),
        female_with_kcpe: femaleKcpe.length,
        male_with_kcpe:   maleKcpe.length,
        female_grade_dist: femaleBands,
        male_grade_dist:   maleBands,
        kcpe_gap:          avg(femaleKcpe) !== null && avg(maleKcpe) !== null
                             ? Math.round((avg(femaleKcpe)! - avg(maleKcpe)!) * 10) / 10
                             : null,
      },
      streams:             streamData,
      pathway_inclination: pathwayInclination,
      grade_bands:         gradeBands,
      marks_by_category:   marksByCategory,
      subject_marks:       subjectMarks,
      has_marks:           ms.length > 0,
      subjects_by_category: subjectsByCategory,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
