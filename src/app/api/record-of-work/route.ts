import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { z } from 'zod'

let _serviceClient: SupabaseClient | null = null
function getClient(): SupabaseClient {
  if (!_serviceClient) {
    _serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _serviceClient
}

const RecordOfWorkSchema = z.object({
  token: z.string().min(8).max(256),
  topic: z.string().min(1).max(500),
  sub_topic: z.string().max(500).optional(),
  objectives: z.string().max(2000).optional(),
  period: z.number().int().min(1).max(10),
  week: z.number().int().min(1).max(52),
  term: z.enum(['Term 1', 'Term 2', 'Term 3']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  was_taught: z.boolean(),
  classwork_given: z.boolean(),
  homework_given: z.boolean(),
  remarks: z.string().max(1000).optional(),
  kcse_progress_percent: z.number().min(0).max(100).optional(),
})

// Public endpoint — validates teacher token then inserts record_of_work.
// schoolId and teacherId are derived server-side from the token; never from the body.

export async function POST(request: Request) {
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = RecordOfWorkSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { token, ...fields } = parsed.data

  // 1. Validate token — derive teacher_id and school_id server-side
  const { data: tokenRow, error: tokenErr } = await getClient()
    .from('teacher_tokens')
    .select('id, teacher_id, school_id, class_name, subject_name, expires_at, is_active, used_count, max_uses')
    .eq('token', token)
    .single()

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 403 })
  }

  if (!tokenRow.is_active || new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ success: false, error: 'Token expired or inactive' }, { status: 403 })
  }

  if (tokenRow.used_count >= tokenRow.max_uses) {
    return NextResponse.json({ success: false, error: 'Token usage limit reached' }, { status: 403 })
  }

  // 2. Insert record of work
  const { error: insertErr } = await getClient()
    .from('records_of_work')
    .insert({
      teacher_id:          tokenRow.teacher_id,
      school_id:           tokenRow.school_id,
      class_name:          tokenRow.class_name,
      subject_name:        tokenRow.subject_name,
      topic:               fields.topic,
      sub_topic:           fields.sub_topic ?? null,
      objectives:          fields.objectives ?? null,
      period:              fields.period,
      week:                fields.week,
      term:                fields.term,
      date:                fields.date,
      was_taught:          fields.was_taught,
      classwork_given:     fields.classwork_given,
      homework_given:      fields.homework_given,
      remarks:             fields.remarks ?? null,
      kcse_progress_percent: fields.kcse_progress_percent ?? null,
    })

  if (insertErr) {
    console.error('[record-of-work] insert error:', insertErr.message)
    return NextResponse.json({ success: false, error: 'Failed to save record' }, { status: 500 })
  }

  // 3. Increment used_count
  await getClient()
    .from('teacher_tokens')
    .update({ used_count: tokenRow.used_count + 1 })
    .eq('id', tokenRow.id)

  return NextResponse.json({ success: true })
}
