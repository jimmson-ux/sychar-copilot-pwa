// POST /api/suspension/build-case — deputy_admin / deputy_principal only
// AI-scrapes evidence and drafts a suspension letter via Claude.
// Creates suspension_records entry with status='draft'.

export const dynamic = 'force-dynamic'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['deputy_admin', 'deputy_principal', 'deputy', 'principal'])

type DisciplineRow = { date: string; incident_type: string; severity: string; action_taken: string | null }
type FlagRow       = { description: string | null; flagged_at: string; severity: string | null }

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: deputy admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    studentId: string
    reason:    string
  } | null

  if (!body?.studentId || !body.reason?.trim()) {
    return NextResponse.json({ error: 'studentId and reason required' }, { status: 400 })
  }

  const db = svc()

  const { data: student } = await db
    .from('students')
    .select('id, full_name, class_name, stream_name, admission_number')
    .eq('id', body.studentId)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const s = student as {
    id: string; full_name: string; class_name: string | null;
    stream_name: string | null; admission_number: string | null
  }

  const month = new Date().getMonth() + 1
  const term  = String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const year  = String(new Date().getFullYear())

  // Scrape evidence in parallel
  const [disciplineRes, attendanceRes, flagsRes] = await Promise.all([
    db.from('discipline_records')
      .select('date, incident_type, severity, action_taken')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', body.studentId)
      .eq('term', term)
      .eq('academic_year', year)
      .order('date', { ascending: false })
      .limit(20),

    db.from('attendance_records')
      .select('date, status')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', body.studentId)
      .gte('date', `${year}-01-01`)
      .order('date', { ascending: false })
      .limit(60),

    db.from('principal_flags')
      .select('description, flagged_at, severity')
      .eq('school_id', auth.schoolId!)
      .eq('student_id', body.studentId)
      .order('flagged_at', { ascending: false })
      .limit(10),
  ])

  const discipline = (disciplineRes.data ?? []) as DisciplineRow[]
  const attendance = (attendanceRes.data ?? []) as { status: string }[]
  const flags      = (flagsRes.data ?? []) as FlagRow[]

  const attTotal   = attendance.length
  const attPresent = attendance.filter(a => a.status === 'present').length
  const attRate    = attTotal > 0 ? Math.round(attPresent / attTotal * 100) : null

  const evidenceSummary = [
    `Student: ${s.full_name}, Class: ${s.class_name ?? 'N/A'}, Adm No: ${s.admission_number ?? 'N/A'}`,
    `Discipline incidents this term (${term}/${year}): ${discipline.length}`,
    ...discipline.slice(0, 5).map(d =>
      `  - ${d.date}: ${d.incident_type} (${d.severity}) — action: ${d.action_taken ?? 'none'}`
    ),
    `Attendance: ${attPresent}/${attTotal} days present (${attRate ?? 'N/A'}%)`,
    flags.length > 0
      ? `Teacher/Principal flags: ${flags.map(f => f.description?.slice(0, 60) ?? 'flag').join('; ')}`
      : '',
    `Stated reason for suspension: ${body.reason}`,
  ].filter(Boolean).join('\n')

  // Draft letter via Claude
  let draftLetter = ''
  try {
    const anthropic = new Anthropic()
    const response  = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{
        role:    'user',
        content: `Draft a formal suspension letter for a Kenyan secondary school.
Student: ${s.full_name}, Class: ${s.class_name ?? 'Unknown'}.
Reason: ${body.reason}.
Evidence summary:
${evidenceSummary}

Format: official letter with school header placeholder, date, student details, grounds for suspension, right to be heard statement per Basic Education Act 2013 Section 38, suspension period (use [START DATE] and [END DATE]), readmission conditions, BOM appeal process.
Tone: firm but fair.
Output only the letter body — no preamble.`,
      }],
    })
    const block = response.content[0]
    draftLetter = block.type === 'text' ? block.text : ''
  } catch (e) {
    console.error('[suspension/build-case] Claude error:', e)
    draftLetter = `[AI draft unavailable — write manually]\n\nReason: ${body.reason}`
  }

  // Create suspension_records entry
  const { data: record, error: insertErr } = await db
    .from('suspension_records')
    .insert({
      school_id:         auth.schoolId,
      student_id:        body.studentId,
      case_summary:      body.reason,
      right_to_be_heard: false,
      proposed_by:       auth.userId,
      status:            'draft',
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[suspension/build-case] insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const suspensionId = (record as { id: string }).id

  // Persist scraped evidence
  type EvidenceInsert = {
    suspension_id: string; evidence_type: string; description: string; collected_at: string
  }
  const evidenceRows: EvidenceInsert[] = [
    ...discipline.map(d => ({
      suspension_id:  suspensionId,
      evidence_type:  'discipline_record',
      description:    `${d.date}: ${d.incident_type} (${d.severity})`,
      collected_at:   new Date().toISOString(),
    })),
    ...flags.map(f => ({
      suspension_id:  suspensionId,
      evidence_type:  'teacher_flag',
      description:    f.description ?? 'Teacher flag',
      collected_at:   new Date().toISOString(),
    })),
  ]

  if (evidenceRows.length > 0) {
    await db.from('suspension_evidence').insert(evidenceRows)
  }

  return NextResponse.json({
    suspensionId,
    draftLetter,
    evidenceCount:      evidenceRows.length,
    attendanceSummary:  { total: attTotal, present: attPresent, rate: attRate },
  })
}
