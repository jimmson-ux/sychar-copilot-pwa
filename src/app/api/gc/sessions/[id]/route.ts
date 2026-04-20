// GET /api/gc/sessions/[id] — decrypt and return a single session (counselor only)
// Logs every access to gc_access_log (immutable audit trail)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'
import { decryptField }            from '@/lib/gc-encryption'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  // Only counselor OR principal with active authorized access window
  const isCounselor = auth.subRole === 'counselor'
  const isPrincipal = auth.subRole === 'principal'

  if (!isCounselor && !isPrincipal) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const db     = svc()

  // Fetch raw session (encrypted fields)
  const { data: session } = await db
    .from('counseling_sessions')
    .select('id, case_id, session_date, session_type, duration_minutes, counselor_id, session_notes, counselor_observations, trauma_indicators, created_at')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const s = session as {
    id: string; case_id: string; session_date: string; session_type: string;
    duration_minutes: number; counselor_id: string;
    session_notes: string | null; counselor_observations: string | null;
    trauma_indicators: string | null; created_at: string;
  }

  if (isCounselor) {
    // Counselor must own this session
    const { data: staff } = await db
      .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
    if (!staff || (staff as { id: string }).id !== s.counselor_id) {
      return NextResponse.json({ error: 'Forbidden: not your session' }, { status: 403 })
    }
  } else {
    // Principal: must have active authorized access for this case
    const now = new Date().toISOString()
    const { data: accessRow } = await db
      .from('gc_access_log')
      .select('id, expires_at, authorized_at')
      .eq('case_id', s.case_id)
      .eq('school_id', auth.schoolId!)
      .not('authorized_at', 'is', null)
      .gt('expires_at', now)
      .order('authorized_at', { ascending: false })
      .limit(1)
      .single()

    if (!accessRow) {
      return NextResponse.json({
        error: 'Access denied: no active authorization for this case. Request counselor access via /api/gc/access-request.',
      }, { status: 403 })
    }
  }

  // ── Decrypt Tier 1 fields ────────────────────────────────────────────────────
  const decryptedNotes        = decryptField(s.session_notes)
  const decryptedObservations = decryptField(s.counselor_observations)
  const rawTrauma             = decryptField(s.trauma_indicators)
  const traumaIndicators      = rawTrauma ? (() => { try { return JSON.parse(rawTrauma) as string[] } catch { return [rawTrauma] } })() : []

  // ── Audit log (immutable — no DELETE policy) ─────────────────────────────────
  const accessorRole = isCounselor ? 'counselor' : 'principal'
  await db.from('gc_access_log').insert({
    school_id:    auth.schoolId,
    case_id:      s.case_id,
    session_id:   id,
    accessed_by:  auth.userId,
    accessor_role: accessorRole,
    accessed_at:  new Date().toISOString(),
    ip_address:   req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
    action:       'read_session',
  }).then(() => {}, () => {})

  return NextResponse.json({
    session: {
      ...s,
      session_notes:          decryptedNotes,
      counselor_observations: decryptedObservations,
      trauma_indicators:      traumaIndicators,
    },
  })
}
