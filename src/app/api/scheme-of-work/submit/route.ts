import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { validateTeacherToken } from '@/lib/validateTeacherToken'

const WeekEntry = z.object({
  week:        z.number().int().min(1).max(52),
  topic:       z.string().max(200),
  subTopic:    z.string().max(200).optional(),
  objectives:  z.string().max(500).optional(),
  activities:  z.string().max(500).optional(),
  resources:   z.string().max(300).optional(),
  assessment:  z.string().max(300).optional(),
  remarks:     z.string().max(300).optional(),
})

const SchemeSchema = z.object({
  token:          z.string().min(8),
  className:      z.string().min(1).max(100),
  subjectName:    z.string().min(1).max(100),
  term:           z.enum(['Term 1', 'Term 2', 'Term 3']),
  year:           z.number().int().min(2020).max(2040),
  curriculumType: z.enum(['844', 'CBC']).default('844'),
  entries:        z.array(WeekEntry).min(1).max(60),
})

const TERM_MAP: Record<string, number> = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 }

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SchemeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { token, className, subjectName, term, year, curriculumType, entries } = parsed.data

  const info = await validateTeacherToken(token)
  if (!info) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const sb = getClient()

  // Upsert scheme header (DB uses integer term + academic_year text)
  const { data: scheme, error: schemeErr } = await sb
    .from('schemes_of_work_new')
    .upsert({
      school_id:       info.schoolId,
      teacher_id:      info.teacherId,
      class_name:      className,
      subject_name:    subjectName,
      term:            TERM_MAP[term],
      academic_year:   String(year),
      curriculum_type: curriculumType,
      updated_at:      new Date().toISOString(),
    }, {
      onConflict: 'school_id,teacher_id,class_name,subject_name,term,academic_year',
    })
    .select('id')
    .single()

  if (schemeErr || !scheme) {
    console.error('[scheme-of-work/submit]', schemeErr?.message)
    return NextResponse.json({ error: 'Failed to save scheme' }, { status: 500 })
  }

  // Delete existing entries for this scheme then re-insert
  await sb.from('scheme_entries').delete().eq('scheme_id', scheme.id)

  const rows = entries.map(e => ({
    scheme_id:   scheme.id,
    week_number: e.week,
    topic:       e.topic,
    sub_topic:   e.subTopic ?? null,
    objectives:  e.objectives ?? null,
    activities:  e.activities ?? null,
    resources:   e.resources ?? null,
    assessment:  e.assessment ?? null,
    remarks:     e.remarks ?? null,
  }))

  const { error: entriesErr } = await sb.from('scheme_entries').insert(rows)

  if (entriesErr) {
    console.error('[scheme-of-work/submit entries]', entriesErr.message)
    return NextResponse.json({ error: 'Failed to save scheme entries' }, { status: 500 })
  }

  return NextResponse.json({ success: true, schemeId: scheme.id, saved: rows.length })
}
