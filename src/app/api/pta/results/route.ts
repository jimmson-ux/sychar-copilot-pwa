// GET /api/pta/results?ballotId=xxx
// Returns results only if: ballot is closed OR requester is principal (staff JWT).
// Parent JWT: sees results only after ballot closes.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const ballotId = req.nextUrl.searchParams.get('ballotId')
  if (!ballotId) return NextResponse.json({ error: 'ballotId required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  // Try parent auth first, then staff auth
  const parent    = await requireParentAuth(req)
  let schoolId: string
  let isPrincipal = false

  if (!parent.unauthorized) {
    schoolId = parent.schoolId
  } else {
    // Fall back to staff Supabase JWT
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { data: { user } } = await svc.auth.getUser(authHeader.slice(7))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: staff } = await svc
      .from('staff_records')
      .select('school_id, sub_role')
      .eq('user_id', user.id)
      .single()

    if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

    type StaffRow = { school_id: string; sub_role: string | null }
    const sr = staff as StaffRow
    schoolId    = sr.school_id
    isPrincipal = sr.sub_role === 'principal'
  }

  const { data: ballot } = await svc
    .from('pta_ballots')
    .select('id, title, options, closing_at, status')
    .eq('id', ballotId)
    .eq('school_id', schoolId)
    .maybeSingle()

  type BallotRow = { id: string; title: string; options: string[]; closing_at: string; status: string }
  const b = ballot as BallotRow | null
  if (!b) return NextResponse.json({ error: 'Ballot not found' }, { status: 404 })

  const isClosed = b.status === 'closed' || new Date(b.closing_at) < new Date()

  if (!isClosed && !isPrincipal) {
    return NextResponse.json({ error: 'Results are available after the ballot closes.' }, { status: 403 })
  }

  const { data: votes } = await svc
    .from('pta_votes')
    .select('vote_choice')
    .eq('ballot_id', b.id)

  const voteRows = (votes ?? []) as { vote_choice: string }[]
  const total    = voteRows.length

  const tally = new Map<string, number>()
  for (const opt of b.options) tally.set(opt, 0)
  for (const v of voteRows) tally.set(v.vote_choice, (tally.get(v.vote_choice) ?? 0) + 1)

  const results = b.options.map(opt => ({
    option:  opt,
    count:   tally.get(opt) ?? 0,
    percent: total > 0 ? Math.round(((tally.get(opt) ?? 0) / total) * 100) : 0,
  }))

  const winner = results.reduce((a, b) => (b.count > a.count ? b : a), results[0])

  return NextResponse.json({
    ballot: { id: b.id, title: b.title, status: b.status, closing_at: b.closing_at },
    total,
    results,
    winner: total > 0 ? winner : null,
  })
}
