// GET  /api/alumni — list alumni with career outcomes + mentorship pool
// POST /api/alumni/[id] — update alumni profile (self-registration via WhatsApp handled in bot)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const year = req.nextUrl.searchParams.get('year')

  let query = db
    .from('alumni')
    .select('id, student_id, full_name, graduation_year, kcse_grade, class_name, current_occupation, university, mentorship_available, subject_specialization, verified, achievements, career_pathway, created_at')
    .eq('school_id', auth.schoolId!)
    .order('graduation_year', { ascending: false })
    .limit(200)

  if (year) query = query.eq('graduation_year', parseInt(year))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const alumni = (data ?? []) as {
    id: string; graduation_year: number; kcse_grade: string | null;
    current_occupation: string | null; university: string | null;
    mentorship_available: boolean; subject_specialization: string | null; verified: boolean;
  }[]

  // Career outcomes breakdown
  const occupations: Record<string, number> = {}
  const universities: Record<string, number> = {}
  let mentorCount = 0

  for (const a of alumni) {
    if (a.current_occupation) {
      const occ = a.current_occupation.trim()
      occupations[occ] = (occupations[occ] ?? 0) + 1
    }
    if (a.university) {
      const uni = a.university.trim()
      universities[uni] = (universities[uni] ?? 0) + 1
    }
    if (a.mentorship_available) mentorCount++
  }

  const gradeBreakdown: Record<string, number> = {}
  for (const a of alumni) {
    if (a.kcse_grade) gradeBreakdown[a.kcse_grade] = (gradeBreakdown[a.kcse_grade] ?? 0) + 1
  }

  const mentors = alumni
    .filter(a => a.mentorship_available && a.verified)
    .map(a => ({
      id: a.id,
      subject_specialization: a.subject_specialization,
      current_occupation: a.current_occupation,
      university: a.university,
    }))

  return NextResponse.json({
    alumni: data ?? [],
    stats: {
      total:          alumni.length,
      verified:       alumni.filter(a => a.verified).length,
      with_mentor:    mentorCount,
      career_outcomes: Object.entries(occupations).sort(([,a],[,b]) => b-a).slice(0, 10).map(([k,v]) => ({ occupation: k, count: v })),
      university_placements: Object.entries(universities).sort(([,a],[,b]) => b-a).slice(0, 10).map(([k,v]) => ({ university: k, count: v })),
      grade_breakdown: Object.entries(gradeBreakdown).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => ({ grade: k, count: v })),
    },
    mentorship_pool: mentors,
  })
}

export async function PATCH(req: NextRequest) {
  // Internal: update alumni profile (called by WhatsApp bot after verification)
  // Protected by internal secret
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db   = svc()
  const body = await req.json() as {
    alumni_id:             string
    current_occupation?:   string
    university?:           string
    mentorship_available?: boolean
    subject_specialization?: string
    whatsapp_number?:      string
    verified?:             boolean
  }

  if (!body.alumni_id) return NextResponse.json({ error: 'alumni_id required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.current_occupation   !== undefined) updates.current_occupation   = body.current_occupation
  if (body.university           !== undefined) updates.university           = body.university
  if (body.mentorship_available !== undefined) updates.mentorship_available = body.mentorship_available
  if (body.subject_specialization !== undefined) updates.subject_specialization = body.subject_specialization
  if (body.whatsapp_number      !== undefined) updates.whatsapp_number      = body.whatsapp_number
  if (body.verified             !== undefined) updates.verified             = body.verified

  const { error } = await db.from('alumni').update(updates).eq('id', body.alumni_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
