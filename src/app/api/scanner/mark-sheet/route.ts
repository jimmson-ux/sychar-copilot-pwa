import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { MarkSheetSchema } from '@/lib/scannerSchemas'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function gradeFromScore(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 75) return 'A-'
  if (score >= 70) return 'B+'
  if (score >= 65) return 'B'
  if (score >= 60) return 'B-'
  if (score >= 55) return 'C+'
  if (score >= 50) return 'C'
  if (score >= 45) return 'C-'
  if (score >= 40) return 'D+'
  if (score >= 35) return 'D'
  if (score >= 30) return 'D-'
  return 'E'
}

export async function POST(request: Request) {
  const supabase = getClient()
  // 1. Verify session
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  // 2. Validate body
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = MarkSheetSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Validation failed', detail: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { students, subjectName, className, examType, term, skipped } = parsed.data

  // 3. Validate all client-supplied studentIds belong to this school (bulk check)
  const suppliedIds = students.map(s => s.studentId).filter(Boolean) as string[]
  if (suppliedIds.length > 0) {
    const { data: validStudents } = await supabase
      .from('students')
      .select('id')
      .in('id', suppliedIds)
      .eq('school_id', auth.schoolId)

    const validIdSet = new Set((validStudents ?? []).map(s => s.id))
    const hasCrossTenantId = suppliedIds.some(id => !validIdSet.has(id))
    if (hasCrossTenantId) {
      return NextResponse.json(
        { success: false, error: 'One or more student IDs are invalid for this school' },
        { status: 400 }
      )
    }
  }

  // 4. Look up subject and class by name — scoped to this school
  const [{ data: subjectRow }, { data: classRow }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id')
      .ilike('name', `%${subjectName}%`)
      .eq('school_id', auth.schoolId)
      .limit(1)
      .single(),
    supabase
      .from('classes')
      .select('id')
      .ilike('name', `%${className}%`)
      .eq('school_id', auth.schoolId)
      .limit(1)
      .single(),
  ])

  const subjectId = subjectRow?.id ?? null
  const classId   = classRow?.id   ?? null

  // 5. Upsert marks
  let savedCount = 0

  for (const s of students) {
    if (!s.studentId) continue
    const { error } = await supabase
      .from('marks')
      .upsert(
        {
          school_id:        auth.schoolId,
          class_id:         classId,
          subject_id:       subjectId,
          student_id:       s.studentId,
          student_name:     s.studentName,
          admission_number: s.admissionNo,
          score:            s.score,
          percentage:       s.score,
          grade:            gradeFromScore(s.score),
          exam_type:        examType,
          term,
        },
        { onConflict: 'class_id,subject_id,student_id,exam_type,term' }
      )
    if (!error) savedCount++
  }

  return NextResponse.json({
    success: true,
    saved:   savedCount,
    skipped: skipped + (students.length - savedCount),
  })
}
