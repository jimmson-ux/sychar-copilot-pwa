import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID!

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const WelfareLogSchema = z.object({
  studentId:     z.string().uuid(),
  sessionDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  wisScore:      z.number().int().min(1).max(5),
  kbiTags:       z.array(z.string().max(50)).max(10).default([]),
  rawNotes:      z.string().max(3000).optional(),
  followUpDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isConfidential: z.boolean().default(true),
})

export async function GET(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allowed = ['principal', 'guidance_counselling']
  if (!allowed.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('studentId')

  const sb = getClient()
  let query = sb
    .from('welfare_logs')
    .select('id, student_id, session_date, wis_score, kbi_tags, follow_up_date, is_confidential, created_at, students!inner(id, full_name, admission_number)')
    .eq('school_id', SCHOOL_ID)
    .order('session_date', { ascending: false })
    .limit(50)

  // Counsellors only see their own records; principals see all but not raw_notes
  if (auth.subRole === 'guidance_counselling') {
    query = query.eq('counsellor_id', auth.userId)
  }

  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  return NextResponse.json({ logs: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'guidance_counselling') {
    return NextResponse.json({ error: 'Only counsellors can create welfare logs' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = WelfareLogSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { studentId, sessionDate, wisScore, kbiTags, rawNotes, followUpDate, isConfidential } = parsed.data
  const sb = getClient()

  // Verify student belongs to school
  const { data: student } = await sb
    .from('students')
    .select('id, full_name')
    .eq('id', studentId)
    .eq('school_id', SCHOOL_ID)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const { data: log, error: logErr } = await sb
    .from('welfare_logs')
    .insert({
      school_id:      SCHOOL_ID,
      student_id:     studentId,
      counsellor_id:  auth.userId,
      session_date:   sessionDate,
      wis_score:      wisScore,
      kbi_tags:       kbiTags,
      raw_notes:      rawNotes ?? null,
      follow_up_date: followUpDate ?? null,
      is_confidential: isConfidential,
    })
    .select('id')
    .single()

  if (logErr || !log) {
    return NextResponse.json({ error: 'Failed to save welfare log' }, { status: 500 })
  }

  return NextResponse.json({ success: true, logId: log.id })
}
