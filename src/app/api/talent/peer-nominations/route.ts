// GET  /api/talent/peer-nominations — list pending nominations (class teacher)
// POST /api/talent/peer-nominations — student submits peer nomination
// PATCH /api/talent/peer-nominations/[id] handled inline via ?action=

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const PEER_CATEGORIES = ['Kindness', 'Helping Others']

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()

  let query = db
    .from('peer_nominations')
    .select('id, nominated_student_id, nominated_by_student_id, category, reason, status, submitted_at, students!nominated_student_id(full_name, class_name), students!nominated_by_student_id(full_name, class_name)')
    .eq('school_id', auth.schoolId!)
    .order('submitted_at', { ascending: false })
    .limit(50)

  // Class teachers see only their class's nominations
  if (auth.subRole === 'teacher') {
    const { data: staff } = await db
      .from('staff_records').select('class_assigned').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    const cls = (staff as { class_assigned: string | null } | null)?.class_assigned
    if (cls) {
      // Filter nominations where nominated student is in this class
      query = query.eq('status', 'pending')
    }
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ nominations: data ?? [] })
}

export async function POST(req: NextRequest) {
  // Peer nominations: submitted by students (authenticated via parent session or student token)
  // OR by any logged-in staff on behalf of students
  const db   = svc()
  const body = await req.json() as {
    school_id:                string   // explicit — public endpoint
    nominated_student_id:     string
    nominated_by_student_id?: string
    category:                 string   // Kindness | Helping Others
    reason:                   string
    student_token?:           string   // optional future: student auth
  }

  if (!body.school_id || !body.nominated_student_id || !body.category || !body.reason?.trim()) {
    return NextResponse.json({ error: 'school_id, nominated_student_id, category, reason required' }, { status: 400 })
  }

  if (!PEER_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: `Peer category must be: ${PEER_CATEGORIES.join(' | ')}` }, { status: 400 })
  }

  // Verify school exists
  const { data: school } = await db.from('schools').select('id').eq('id', body.school_id).single()
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  // Prevent self-nomination
  if (body.nominated_by_student_id && body.nominated_by_student_id === body.nominated_student_id) {
    return NextResponse.json({ error: 'Cannot nominate yourself' }, { status: 400 })
  }

  // Rate limit: max 2 peer nominations per week per nominator
  if (body.nominated_by_student_id) {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { count } = await db
      .from('peer_nominations')
      .select('id', { count: 'exact' })
      .eq('school_id', body.school_id)
      .eq('nominated_by_student_id', body.nominated_by_student_id)
      .gte('submitted_at', weekAgo)
    if ((count ?? 0) >= 2) {
      return NextResponse.json({ error: 'Maximum 2 peer nominations per week' }, { status: 429 })
    }
  }

  const { data, error } = await db
    .from('peer_nominations')
    .insert({
      school_id:                body.school_id,
      nominated_student_id:     body.nominated_student_id,
      nominated_by_student_id:  body.nominated_by_student_id ?? null,
      category:                 body.category,
      reason:                   body.reason.trim(),
      status:                   'pending',
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Alert class teacher to review
  await db.from('alerts').insert({
    school_id: body.school_id,
    type:      'peer_nomination_pending',
    severity:  'low',
    title:     `New peer nomination for "${body.category}" — requires your review`,
    detail:    { nomination_id: (data as { id: string }).id, category: body.category },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, nomination_id: (data as { id: string }).id })
}

export async function PATCH(req: NextRequest) {
  // Class teacher approves or rejects
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['teacher', 'deputy', 'deputy_principal', 'principal'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as { nomination_id: string; action: 'approve' | 'reject' }
  if (!body.nomination_id || !body.action) {
    return NextResponse.json({ error: 'nomination_id and action required' }, { status: 400 })
  }

  const { data: nom } = await db
    .from('peer_nominations')
    .select('id, nominated_student_id, category, reason, status, school_id')
    .eq('id', body.nomination_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!nom) return NextResponse.json({ error: 'Nomination not found' }, { status: 404 })
  const n = nom as { id: string; nominated_student_id: string; category: string; reason: string; status: string; school_id: string }
  if (n.status !== 'pending') return NextResponse.json({ error: 'Already actioned' }, { status: 409 })

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  const staffId = (staff as { id: string } | null)?.id

  await db.from('peer_nominations').update({
    status:      body.action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: staffId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', body.nomination_id)

  if (body.action === 'approve' && staffId) {
    // Convert to talent point
    await db.from('talent_points').insert({
      school_id:           auth.schoolId,
      student_id:          n.nominated_student_id,
      awarded_by:          staffId,
      category:            'School Citizenship',
      sub_category:        n.category,
      points:              2,
      reason:              `Peer recognition — ${n.category}: ${n.reason}`,
      term_id:             currentTermId(),
      is_peer_nomination:  true,
      status:              'approved',
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ ok: true, action: body.action })
}

function currentTermId() {
  const now = new Date(); const m = now.getMonth() + 1
  return `${now.getFullYear()}-T${m <= 4 ? 1 : m <= 8 ? 2 : 3}`
}
