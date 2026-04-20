// GET /api/timetable/execute?job=<jobId>
// Called internally by /api/timetable/generate — runs the GA and writes results.
// Protected by x-internal-key header, not user auth.

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Types ──────────────────────────────────────────────────────────────────

interface JobConfig {
  term: number
  academicYear: string
  classes: string[]
  weights: { W_c: number; W_p: number; W_t: number }
}

interface SubjectRow {
  id: string
  name: string
  code: string | null
  cognitive_demand: number
  lessons_per_week: number
}

interface StaffRow {
  id: string
  full_name: string
  teacher_initials: string | null
  max_daily_lessons: number
  reliability_index: number
  department: string | null
}

interface PeriodRow {
  period_number: number
  cognitive_yield: number
  start_time: string
  end_time: string
}

interface Gene {
  classIdx: number
  periodIdx: number
  subjectIdx: number
  teacherIdx: number
}

type Chromosome = Gene[]

// ── Scoring ────────────────────────────────────────────────────────────────

function scoreChromosome(
  chrom: Chromosome,
  subjects: SubjectRow[],
  teachers: StaffRow[],
  periods: PeriodRow[],
  classes: string[],
  weights: { W_c: number; W_p: number; W_t: number }
): number {
  let total = 0

  // Track teacher daily load for fatigue penalty
  const teacherDailyLoad: Record<string, number> = {}
  // Track class period usage to penalise double-bookings
  const classPeriodMap: Record<string, number> = {}

  let conflictPenalty = 0

  for (const gene of chrom) {
    const subject = subjects[gene.subjectIdx]
    const teacher = teachers[gene.teacherIdx]
    const period  = periods[gene.periodIdx]
    if (!subject || !teacher || !period) continue

    const demand = subject.cognitive_demand  // 1-3
    const yield_ = period.cognitive_yield    // 1-3

    // W_c component: cognitive alignment — high demand in high-yield periods
    const cogScore = demand * yield_  // max 9

    // W_p component: period spread — penalise same class having many lessons in same half-day
    const classKey = `${gene.classIdx}`
    classPeriodMap[classKey] = (classPeriodMap[classKey] ?? 0) + 1
    const classAvg = classPeriodMap[classKey]
    const spreadScore = 1 / (classAvg * 0.1 + 1) * 60  // diminishing returns

    // W_t component: teacher reliability minus fatigue
    const teacherKey = `${gene.teacherIdx}`
    teacherDailyLoad[teacherKey] = (teacherDailyLoad[teacherKey] ?? 0) + 1
    const fatigue = Math.max(0, teacherDailyLoad[teacherKey] - teacher.max_daily_lessons) * 5
    const teacherScore = teacher.reliability_index * 10 - fatigue

    total +=
      weights.W_c * cogScore +
      weights.W_p * spreadScore +
      weights.W_t * teacherScore
  }

  return total - conflictPenalty
}

// ── GA helpers ─────────────────────────────────────────────────────────────

function randomChromosome(
  classes: string[],
  subjects: SubjectRow[],
  teachers: StaffRow[],
  periods: PeriodRow[]
): Chromosome {
  const genes: Gene[] = []
  for (let ci = 0; ci < classes.length; ci++) {
    for (let si = 0; si < subjects.length; si++) {
      const lessonsNeeded = subjects[si].lessons_per_week
      for (let l = 0; l < lessonsNeeded; l++) {
        genes.push({
          classIdx:   ci,
          periodIdx:  Math.floor(Math.random() * periods.length),
          subjectIdx: si,
          teacherIdx: Math.floor(Math.random() * teachers.length),
        })
      }
    }
  }
  return genes
}

function crossover(a: Chromosome, b: Chromosome): Chromosome {
  const cut = Math.floor(Math.random() * a.length)
  return [...a.slice(0, cut), ...b.slice(cut)]
}

function mutate(chrom: Chromosome, teachers: StaffRow[], periods: PeriodRow[]): Chromosome {
  const idx = Math.floor(Math.random() * chrom.length)
  const gene = { ...chrom[idx] }
  const roll = Math.random()
  if (roll < 0.5) {
    gene.periodIdx = Math.floor(Math.random() * periods.length)
  } else {
    gene.teacherIdx = Math.floor(Math.random() * teachers.length)
  }
  const clone = [...chrom]
  clone[idx] = gene
  return clone
}

function tournamentSelect(
  population: Chromosome[],
  scores: number[],
  k = 3
): Chromosome {
  let best = Math.floor(Math.random() * population.length)
  for (let i = 1; i < k; i++) {
    const challenger = Math.floor(Math.random() * population.length)
    if (scores[challenger] > scores[best]) best = challenger
  }
  return population[best]
}

// ── Main GA runner ─────────────────────────────────────────────────────────

async function runGA(
  db: SupabaseClient,
  jobId: string,
  schoolId: string,
  subjects: SubjectRow[],
  teachers: StaffRow[],
  periods: PeriodRow[],
  classes: string[],
  weights: { W_c: number; W_p: number; W_t: number }
): Promise<{ bestChrom: Chromosome; bestScore: number }> {
  const POP_SIZE   = 30
  const GENERATIONS = 200
  const MUTATION_RATE = 0.15

  // Initialise population
  let population: Chromosome[] = Array.from({ length: POP_SIZE }, () =>
    randomChromosome(classes, subjects, teachers, periods)
  )

  let bestChrom = population[0]
  let bestScore = -Infinity

  for (let gen = 0; gen < GENERATIONS; gen++) {
    const scores = population.map(c =>
      scoreChromosome(c, subjects, teachers, periods, classes, weights)
    )

    // Track best
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > bestScore) {
        bestScore = scores[i]
        bestChrom = population[i]
      }
    }

    // Update progress every 25 generations
    if (gen > 0 && gen % 25 === 0) {
      const progress = Math.round((gen / GENERATIONS) * 90) // reserve 90-100 for DB write
      await db
        .from('timetable_jobs')
        .update({ progress })
        .eq('id', jobId)
        .eq('school_id', schoolId)
    }

    // Breed next generation
    const next: Chromosome[] = []
    // Elitism: keep top 2
    const sorted = [...scores.keys()].sort((a, b) => scores[b] - scores[a])
    next.push(population[sorted[0]], population[sorted[1]])

    while (next.length < POP_SIZE) {
      const parent1 = tournamentSelect(population, scores)
      const parent2 = tournamentSelect(population, scores)
      let child = crossover(parent1, parent2)
      if (Math.random() < MUTATION_RATE) {
        child = mutate(child, teachers, periods)
      }
      next.push(child)
    }

    population = next
  }

  return { bestChrom, bestScore }
}

// ── Days of week for timetable entries ────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const internalKey = process.env.TIMETABLE_INTERNAL_KEY ?? 'sychar-internal'
  if (req.headers.get('x-internal-key') !== internalKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const jobId = req.nextUrl.searchParams.get('job')
  if (!jobId) {
    return NextResponse.json({ error: 'job param required' }, { status: 400 })
  }

  const db = serviceClient()

  // Fetch and lock the job
  const { data: job, error: jobErr } = await db
    .from('timetable_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  if (job.status !== 'queued') {
    return NextResponse.json({ error: `Job is ${job.status}` }, { status: 409 })
  }

  const schoolId  = job.school_id as string
  const config    = job.config as JobConfig
  const { term, academicYear, classes: configClasses, weights } = config

  // Mark running
  await db
    .from('timetable_jobs')
    .update({ status: 'running', started_at: new Date().toISOString(), progress: 5 })
    .eq('id', jobId)
    .eq('school_id', schoolId)

  try {
    // Fetch subjects
    const { data: subjectsRaw } = await db
      .from('subjects')
      .select('id, name, code, cognitive_demand, lessons_per_week')
      .eq('school_id', schoolId)
      .eq('is_core', true)

    const subjects = (subjectsRaw ?? []) as SubjectRow[]

    if (subjects.length === 0) {
      throw new Error('No subjects found for this school')
    }

    // Fetch active teaching staff
    const { data: staffRaw } = await db
      .from('staff_records')
      .select('id, full_name, teacher_initials, max_daily_lessons, reliability_index, department, sub_role')
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .eq('can_login', true)

    type RawStaff = { id: string; full_name: string; teacher_initials: string | null; max_daily_lessons: number | null; reliability_index: number | null; department: string | null; sub_role: string | null }
    const teachers = ((staffRaw ?? []) as RawStaff[]).filter(
      s => !['principal','deputy_principal_academics','deputy_principal_academic',
              'deputy_principal_admin','deputy_principal_discipline'].includes(s.sub_role ?? '')
    ) as StaffRow[]

    if (teachers.length === 0) {
      throw new Error('No teaching staff found for this school')
    }

    // Fetch period times
    const { data: periodsRaw } = await db
      .from('period_times')
      .select('period_number, cognitive_yield, start_time, end_time')
      .eq('school_id', schoolId)
      .order('period_number')

    const periods = (periodsRaw ?? []) as PeriodRow[]

    if (periods.length === 0) {
      throw new Error('No period times configured for this school')
    }

    // Determine classes
    let classes = configClasses
    if (!classes || classes.length === 0) {
      const { data: ttClasses } = await db
        .from('timetable')
        .select('class_name')
        .eq('school_id', schoolId)
        .not('class_name', 'is', null)
      const unique = [...new Set((ttClasses ?? []).map((r: { class_name: string }) => r.class_name))]
      classes = unique.length > 0 ? unique : ['Form 1','Form 2','Form 3','Form 4']
    }

    await db
      .from('timetable_jobs')
      .update({ progress: 10 })
      .eq('id', jobId)
      .eq('school_id', schoolId)

    // Run GA
    const { bestChrom, bestScore } = await runGA(
      db, jobId, schoolId, subjects, teachers, periods, classes, weights
    )

    await db
      .from('timetable_jobs')
      .update({ progress: 92 })
      .eq('id', jobId)
      .eq('school_id', schoolId)

    // Delete old timetable entries for this term/year
    await db
      .from('timetable')
      .delete()
      .eq('school_id', schoolId)
      .eq('term', String(term))
      .eq('academic_year', academicYear)

    // Build timetable rows from best chromosome
    const dayPeriodsCount = periods.length
    const timetableRows: Record<string, unknown>[] = []
    const warnings: string[] = []

    for (const gene of bestChrom) {
      const subject = subjects[gene.subjectIdx]
      const teacher = teachers[gene.teacherIdx]
      const period  = periods[gene.periodIdx]
      const className = classes[gene.classIdx]

      if (!subject || !teacher || !period || !className) continue

      // Distribute across days: use periodIdx modulo to pick day
      const dayIdx = gene.periodIdx % DAYS.length
      const day    = DAYS[dayIdx]
      const periodNumber = period.period_number

      timetableRows.push({
        school_id:        schoolId,
        class_name:       className,
        day,
        period:           `Period ${periodNumber}`,
        period_number:    periodNumber,
        subject:          subject.name,
        subject_code:     subject.code ?? '',
        teacher_initials: teacher.teacher_initials ?? teacher.full_name.slice(0, 3).toUpperCase(),
        teacher_name:     teacher.full_name,
        teacher_id:       teacher.id,
        term:             String(term),
        academic_year:    academicYear,
        start_time:       period.start_time,
        end_time:         period.end_time,
        is_published:     false,
        is_active:        true,
      })
    }

    // Check for teacher double-booking on same day/period
    const bookingSet = new Set<string>()
    for (const row of timetableRows) {
      const key = `${row.teacher_id}|${row.day}|${row.period_number}`
      if (bookingSet.has(key as string)) {
        warnings.push(`Teacher ${row.teacher_name} double-booked on ${row.day} Period ${row.period_number}`)
      }
      bookingSet.add(key as string)
    }

    // Bulk insert (batch to 200 at a time)
    const BATCH = 200
    for (let i = 0; i < timetableRows.length; i += BATCH) {
      const { error: insertErr } = await db
        .from('timetable')
        .insert(timetableRows.slice(i, i + BATCH))
      if (insertErr) {
        warnings.push(`Batch insert warning: ${insertErr.message}`)
      }
    }

    // Calculate cognitive optimisation %
    let cogAligned = 0
    for (const gene of bestChrom) {
      const s = subjects[gene.subjectIdx]
      const p = periods[gene.periodIdx]
      if (s && p && s.cognitive_demand === 3 && p.cognitive_yield >= 2) cogAligned++
    }
    const cogOptimizationPct = bestChrom.length > 0
      ? Math.round((cogAligned / bestChrom.length) * 100)
      : 0

    const resultSummary = {
      overallScore: Math.round(bestScore),
      cogOptimizationPct,
      totalLessons: timetableRows.length,
      classes: classes.length,
      subjects: subjects.length,
      teachers: teachers.length,
      warnings: warnings.slice(0, 20),
    }

    await db
      .from('timetable_jobs')
      .update({
        status: 'complete',
        progress: 100,
        completed_at: new Date().toISOString(),
        result_summary: resultSummary,
      })
      .eq('id', jobId)
      .eq('school_id', schoolId)

    return NextResponse.json({ ok: true, jobId, resultSummary })

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await db
      .from('timetable_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('school_id', schoolId)

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
