// POST /api/pta/vote
// Body: { ballotId, voteChoice }
// Fee clearance check (min_fee_percent); UNIQUE(ballot_id, parent_phone) prevents duplicates.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const body = await req.json().catch(() => ({})) as {
    ballotId?:   string
    voteChoice?: string
  }

  if (!body.ballotId?.trim() || !body.voteChoice?.trim()) {
    return NextResponse.json({ error: 'ballotId and voteChoice required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Load ballot
  const { data: ballot } = await svc
    .from('pta_ballots')
    .select('id, school_id, options, closing_at, status, min_fee_percent')
    .eq('id', body.ballotId)
    .eq('school_id', parent.schoolId)
    .maybeSingle()

  type BallotRow = {
    id: string; school_id: string; options: string[]
    closing_at: string; status: string; min_fee_percent: number
  }
  const b = ballot as BallotRow | null

  if (!b) return NextResponse.json({ error: 'Ballot not found' }, { status: 404 })
  if (b.status !== 'active') return NextResponse.json({ error: 'Ballot is not active' }, { status: 409 })
  if (new Date(b.closing_at) < new Date()) {
    return NextResponse.json({ error: 'Ballot has closed' }, { status: 410 })
  }
  if (!b.options.includes(body.voteChoice)) {
    return NextResponse.json({ error: 'Invalid vote choice' }, { status: 400 })
  }

  // Fee clearance check if min_fee_percent > 0
  if (b.min_fee_percent > 0) {
    const { data: feeRows } = await svc
      .from('fee_balances')
      .select('invoiced_amount, paid_amount')
      .in('student_id', parent.studentIds)
      .eq('school_id', parent.schoolId)

    type FeeRow = { invoiced_amount: number; paid_amount: number }
    const rows = (feeRows ?? []) as FeeRow[]
    const totalInvoiced = rows.reduce((s, r) => s + Number(r.invoiced_amount), 0)
    const totalPaid     = rows.reduce((s, r) => s + Number(r.paid_amount), 0)
    const clearanceRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 100

    if (clearanceRate < b.min_fee_percent) {
      return NextResponse.json({
        error: `Voting requires at least ${b.min_fee_percent}% fee clearance. Your current clearance is ${clearanceRate}%.`,
      }, { status: 403 })
    }
  }

  // Insert vote — UNIQUE constraint on (ballot_id, parent_phone) handles duplicates
  const { error } = await svc.from('pta_votes').insert({
    ballot_id:   b.id,
    school_id:   parent.schoolId,
    parent_phone: parent.phone,
    vote_choice: body.voteChoice,
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You have already voted on this ballot.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Vote could not be recorded' }, { status: 500 })
  }

  return NextResponse.json({ voted: true, choice: body.voteChoice })
}
