import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { validateTeacherToken } from '@/lib/validateTeacherToken'

const ScoreRow = z.object({
  studentId:   z.string().uuid().nullable(),
  studentName: z.string().max(100),
  admissionNo: z.string().max(20).nullable(),
  score:       z.number().min(0).max(100),
})

const ExamScoresSchema = z.object({
  token:       z.string().min(8),
  className:   z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-]+$/),
  subjectName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-.()/&:]+$/),
  examType:    z.string().min(1).max(50),
  term:        z.enum(['Term 1', 'Term 2', 'Term 3']),
  scores:      z.array(ScoreRow).min(1).max(120),
})

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ExamScoresSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { token, className, subjectName, examType, term, scores } = parsed.data

  const info = await validateTeacherToken(token)
  if (!info) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Build rows for subject_performance
  const rows = scores.map(s => ({
    school_id:    info.schoolId,
    teacher_id:   info.teacherId,
    student_id:   s.studentId ?? null,
    student_name: s.studentName,
    admission_no: s.admissionNo ?? null,
    class_name:   className,
    subject_name: subjectName,
    exam_type:    examType,
    term,
    score:        s.score,
    recorded_at:  new Date().toISOString(),
  }))

  const { error } = await sb.from('subject_performance').insert(rows)

  if (error) {
    console.error('[exam/scores]', error.message)
    return NextResponse.json({ error: 'Failed to save scores' }, { status: 500 })
  }

  // Compute summary for AI guide
  const nums = scores.map(s => s.score)
  const avg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
  const atRisk = nums.filter(n => n < 50).length
  const excelling = nums.filter(n => n >= 75).length

  return NextResponse.json({ success: true, saved: rows.length, avg, atRisk, excelling })
}
