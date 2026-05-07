// POST /api/suspension/generate-letter
// Generates a Claude-authored suspension letter for a student.
// Principal and deputy_principal only.
// Body: { student_id, type, duration_days, start_date, reason_summary, rules_violated[] }
// Returns: { letter_text, draft_id }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'

const ALLOWED = new Set(['principal','deputy_principal','deputy_principal_admin','deputy_principal_discipline'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — principal access required' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    student_id?:    string
    type?:          'internal' | 'external' | 'indefinite'
    duration_days?: number
    start_date?:    string
    reason_summary?: string
    rules_violated?: string[]
  }

  if (!body.student_id || !body.type || !body.reason_summary) {
    return NextResponse.json({ error: 'student_id, type, and reason_summary required' }, { status: 400 })
  }

  const db = createAdminSupabaseClient()

  const { data: student } = await db
    .from('students')
    .select('full_name,admission_no,class_name,stream_name,gender')
    .eq('id', body.student_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const { data: school } = await db
    .from('schools')
    .select('name,county,sub_county')
    .eq('id', auth.schoolId)
    .single()

  const { data: principal } = await db
    .from('staff_records')
    .select('full_name')
    .eq('school_id', auth.schoolId)
    .eq('sub_role', 'principal')
    .single()

  const startDate  = body.start_date ?? new Date().toISOString().split('T')[0]
  const returnDate = body.type !== 'indefinite' && body.duration_days
    ? new Date(new Date(startDate).getTime() + body.duration_days * 86400000)
        .toISOString().split('T')[0]
    : null

  const pronoun = student.gender === 'F' ? { sub: 'she', obj: 'her', pos: 'her' }
                                         : { sub: 'he',  obj: 'him', pos: 'his' }

  const prompt = `You are a school administrator writing an official suspension letter.

School: ${school?.name ?? 'Nkoroi Mixed Day Senior Secondary School'}
Student: ${student.full_name}, Admission No: ${student.admission_no}
Class: ${student.class_name} ${student.stream_name}
Suspension type: ${body.type}
Duration: ${body.duration_days ?? 'indefinite'} days
Start date: ${startDate}
Return date: ${returnDate ?? 'To be communicated'}
Reason: ${body.reason_summary}
School rules violated: ${(body.rules_violated ?? []).join(', ') || 'See reason above'}
Principal: ${principal?.full_name ?? 'The Principal'}
Date: ${new Date().toLocaleDateString('en-KE', { day:'numeric', month:'long', year:'numeric' })}

Write a formal, professional suspension letter addressed to the parent/guardian of ${student.full_name}.
Use ${pronoun.sub}/${pronoun.obj}/${pronoun.pos} pronouns.
Include: date, salutation, formal statement of suspension, reason, duration, conditions for return, and signature block.
Format as plain text with proper paragraphs. No markdown. No placeholders in square brackets.`

  try {
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })
    const resp = await claude.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1000,
      messages:   [{ role: 'user', content: prompt }],
    })
    const letterText = (resp.content[0] as { text: string }).text.trim()

    // Store draft — table may not exist yet; fail gracefully
    let draftId: string | null = null
    try {
      const { data: draft } = await db
        .from('suspension_letters')
        .insert({
          school_id:       auth.schoolId,
          student_id:      body.student_id,
          suspension_type: body.type,
          duration_days:   body.duration_days ?? null,
          start_date:      startDate,
          return_date:     returnDate,
          reason_summary:  body.reason_summary,
          rules_violated:  body.rules_violated ?? [],
          letter_text:     letterText,
          status:          'draft',
          drafted_by:      auth.userId,
          created_at:      new Date().toISOString(),
        })
        .select('id')
        .single()
      draftId = (draft as { id?: string } | null)?.id ?? null
    } catch { /* table may not exist */ }

    return NextResponse.json({
      letter_text: letterText,
      draft_id:    draftId,
      student:     { full_name: student.full_name, class: `${student.class_name} ${student.stream_name}` },
      meta: {
        type:        body.type,
        start_date:  startDate,
        return_date: returnDate,
      },
    })
  } catch (err) {
    console.error('[suspension/generate-letter]', err)
    return NextResponse.json({ error: 'Letter generation failed' }, { status: 500 })
  }
}
