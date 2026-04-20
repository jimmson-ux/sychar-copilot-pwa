// GET  /api/talent/points — list points (filtered by student/term/category)
// POST /api/talent/points — award points to a student

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'
import { sendWhatsApp }            from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const CATEGORIES = [
  'Academic Excellence',
  'Leadership & Character',
  'Sports & Physical',
  'Arts & Culture',
  'Innovation & Technical',
  'School Citizenship',
]

const WEEKLY_CAP_PER_TEACHER = 3   // max nominations per category per week
const DISTRIBUTION_THRESHOLD = 0.6 // >60% points to <20% students → alert

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db         = svc()
  const studentId  = req.nextUrl.searchParams.get('student_id')
  const termId     = req.nextUrl.searchParams.get('term_id')
  const category   = req.nextUrl.searchParams.get('category')

  let query = db
    .from('talent_points')
    .select('id, student_id, category, sub_category, points, reason, term_id, awarded_at, status, students(full_name, class_name), staff_records!awarded_by(full_name)')
    .eq('school_id', auth.schoolId!)
    .eq('status', 'approved')
    .order('awarded_at', { ascending: false })
    .limit(100)

  if (studentId) query = query.eq('student_id', studentId)
  if (termId)    query = query.eq('term_id',    termId)
  if (category)  query = query.eq('category',   category)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ points: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allowedRoles = ['teacher', 'deputy', 'deputy_principal', 'principal', 'counselor']
  if (!allowedRoles.includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:    string
    category:      string
    sub_category?: string
    points:        number
    reason:        string
    term_id?:      string
  }

  if (!body.student_id || !body.category || !body.points || !body.reason?.trim()) {
    return NextResponse.json({ error: 'student_id, category, points, reason required' }, { status: 400 })
  }

  if (!CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(', ')}` }, { status: 400 })
  }

  if (body.points < 1 || body.points > 10) {
    return NextResponse.json({ error: 'points must be 1–10' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const staffId = (staff as { id: string }).id
  const termId  = body.term_id ?? currentTermId()

  // ── Equity Safeguard 1: Weekly cap per teacher per category ───────────────
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count: weeklyCount } = await db
    .from('talent_points')
    .select('id', { count: 'exact' })
    .eq('school_id', auth.schoolId!)
    .eq('awarded_by', staffId)
    .eq('category', body.category)
    .gte('awarded_at', weekAgo)

  if ((weeklyCount ?? 0) >= WEEKLY_CAP_PER_TEACHER) {
    return NextResponse.json({
      error: `Weekly nomination cap reached: max ${WEEKLY_CAP_PER_TEACHER} nominations per category per week`,
    }, { status: 429 })
  }

  // Insert the point record
  const { data: record, error: insErr } = await db
    .from('talent_points')
    .insert({
      school_id:    auth.schoolId,
      student_id:   body.student_id,
      awarded_by:   staffId,
      category:     body.category,
      sub_category: body.sub_category ?? null,
      points:       body.points,
      reason:       body.reason.trim(),
      term_id:      termId,
      status:       'approved',
    })
    .select('id')
    .single()

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // ── Equity Safeguard 2: Distribution monitoring ───────────────────────────
  // Run async — don't block the response
  runDistributionCheck(db, auth.schoolId!, termId).then(() => {}, () => {})

  // ── Equity Safeguard 4: Category diversity flag ───────────────────────────
  checkCategoryDiversity(db, auth.schoolId!, body.student_id, termId).then(() => {}, () => {})

  // ── Parent WhatsApp notification ─────────────────────────────────────────
  notifyParent(db, auth.schoolId!, body.student_id, body.category, body.reason, body.points).then(() => {}, () => {})

  return NextResponse.json({ ok: true, point_id: (record as { id: string }).id })
}

async function runDistributionCheck(db: ReturnType<typeof svc>, schoolId: string, termId: string) {
  // Fetch all points this term
  const { data } = await db
    .from('talent_points')
    .select('student_id, points')
    .eq('school_id', schoolId)
    .eq('term_id', termId)
    .eq('status', 'approved')

  if (!data || data.length < 20) return  // not enough data yet

  const rows = data as { student_id: string; points: number }[]

  // Total points and per-student totals
  const totalPoints = rows.reduce((a, r) => a + r.points, 0)
  const byStudent   = new Map<string, number>()
  for (const r of rows) byStudent.set(r.student_id, (byStudent.get(r.student_id) ?? 0) + r.points)

  const sorted         = [...byStudent.values()].sort((a, b) => b - a)
  const top20pctCount  = Math.ceil(byStudent.size * 0.2)
  const top20pctPoints = sorted.slice(0, top20pctCount).reduce((a, b) => a + b, 0)
  const top20pctShare  = totalPoints > 0 ? top20pctPoints / totalPoints : 0

  if (top20pctShare > DISTRIBUTION_THRESHOLD) {
    await db.from('alerts').insert({
      school_id: schoolId,
      type:      'talent_distribution_skewed',
      severity:  'medium',
      title:     `Review point distribution: ${Math.round(top20pctShare * 100)}% of talent points going to top 20% of students`,
      detail:    { term_id: termId, top_20pct_share: Math.round(top20pctShare * 100) },
    }).then(() => {}, () => {})
  }
}

async function checkCategoryDiversity(db: ReturnType<typeof svc>, schoolId: string, studentId: string, termId: string) {
  const { data } = await db
    .from('talent_points')
    .select('category, points')
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .eq('term_id', termId)
    .eq('status', 'approved')

  if (!data) return
  const rows = data as { category: string; points: number }[]

  const byCategory: Record<string, number> = {}
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + r.points
  const totalPoints = Object.values(byCategory).reduce((a, b) => a + b, 0)

  // Flag if any single category has 50+ pts and student has zero in others
  for (const [cat, pts] of Object.entries(byCategory)) {
    const othersTotal = totalPoints - pts
    if (pts >= 50 && othersTotal === 0) {
      await db.from('alerts').insert({
        school_id: schoolId,
        type:      'talent_no_category_diversity',
        severity:  'low',
        title:     `Student has 50+ points in "${cat}" but zero in all other categories`,
        detail:    { student_id: studentId, category: cat, points: pts },
      }).then(() => {}, () => {})
      break
    }
  }
}

async function notifyParent(
  db: ReturnType<typeof svc>, schoolId: string,
  studentId: string, category: string, reason: string, points: number
) {
  const { data: student } = await db
    .from('students')
    .select('full_name, class_name, parent_phone')
    .eq('id', studentId)
    .eq('school_id', schoolId)
    .single()
  if (!student) return

  const s = student as { full_name: string; class_name: string; parent_phone: string | null }
  if (!s.parent_phone) return

  const msg = `🌟 *Recognition Notice*\n\nDear Parent/Guardian,\n\n${s.full_name} (${s.class_name}) has been recognised for *${category}*!\n\n"${reason}"\n\n${points} point${points > 1 ? 's' : ''} awarded. Keep encouraging them — they are doing great!`
  await sendWhatsApp(s.parent_phone, msg)

  await db.from('talent_points')
    .update({ notified_parent: true })
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .eq('notified_parent', false)
    .order('awarded_at', { ascending: false })
    .limit(1)
    .then(() => {}, () => {})
}

function currentTermId() {
  const now = new Date(); const m = now.getMonth() + 1
  return `${now.getFullYear()}-T${m <= 4 ? 1 : m <= 8 ? 2 : 3}`
}
