// POST /api/gc/sessions — create sealed session note (Tier 1, counselor only)
// GET  /api/gc/sessions — list sessions for a case (NO content, counselor only)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'
import { encryptField }            from '@/lib/gc-encryption'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'counselor') {
    return NextResponse.json({ error: 'Forbidden: counselor only' }, { status: 403 })
  }

  const caseId = req.nextUrl.searchParams.get('case_id')
  const db     = svc()

  let query = db
    .from('counseling_sessions')
    .select('id, case_id, session_date, session_type, duration_minutes, counselor_id, created_at')
    // NOTE: no session_notes, counselor_observations, trauma_indicators — encrypted content stays server-side
    .eq('school_id', auth.schoolId!)
    .order('session_date', { ascending: false })
    .limit(50)

  if (caseId) query = query.eq('case_id', caseId)

  // Counselor only sees their own sessions
  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (staff) query = query.eq('counselor_id', (staff as { id: string }).id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sessions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'counselor') {
    return NextResponse.json({ error: 'Forbidden: counselor only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    case_id:               string
    session_date:          string
    session_type:          string   // individual | group | family | crisis
    duration_minutes?:     number
    session_notes?:        string   // Tier 1 — will be AES-256-GCM encrypted
    counselor_observations?: string // Tier 1 — encrypted
    trauma_indicators?:    string[] // Tier 1 — encrypted as JSON string
    next_session_plan?:    string   // Tier 2 — plaintext, stored in case
  }

  if (!body.case_id || !body.session_date || !body.session_type) {
    return NextResponse.json({ error: 'case_id, session_date, session_type required' }, { status: 400 })
  }

  // Verify case belongs to this counselor's school
  const { data: gc_case } = await db
    .from('counseling_cases')
    .select('id, student_id, counselor_id')
    .eq('id', body.case_id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!gc_case) return NextResponse.json({ error: 'Case not found' }, { status: 404 })

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const staffId = (staff as { id: string }).id

  // Verify counselor owns this case
  if ((gc_case as { counselor_id: string }).counselor_id !== staffId) {
    return NextResponse.json({ error: 'Forbidden: not your case' }, { status: 403 })
  }

  // ── Tier 1 encryption ────────────────────────────────────────────────────────
  const encryptedNotes        = encryptField(body.session_notes ?? null)
  const encryptedObservations = encryptField(body.counselor_observations ?? null)
  const encryptedTrauma       = body.trauma_indicators?.length
    ? encryptField(JSON.stringify(body.trauma_indicators))
    : null

  const { data, error } = await db
    .from('counseling_sessions')
    .insert({
      school_id:              auth.schoolId,
      case_id:                body.case_id,
      counselor_id:           staffId,
      session_date:           body.session_date,
      session_type:           body.session_type,
      duration_minutes:       body.duration_minutes ?? 60,
      session_notes:          encryptedNotes,           // encrypted
      counselor_observations: encryptedObservations,    // encrypted
      trauma_indicators:      encryptedTrauma,          // encrypted
    })
    .select('id, session_date, session_type')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update case last_session_date + session count
  await db.from('counseling_cases').update({
    last_session_date: body.session_date,
    session_count:     db.rpc('increment', { row_id: body.case_id, table: 'counseling_cases', col: 'session_count' }),
  }).eq('id', body.case_id).then(() => {}, () => {})

  // Simpler: raw increment via RPC if available, else just update date
  await db.from('counseling_cases')
    .update({ last_session_date: body.session_date })
    .eq('id', body.case_id)
    .then(() => {}, () => {})

  return NextResponse.json({ ok: true, session_id: (data as { id: string }).id })
}
