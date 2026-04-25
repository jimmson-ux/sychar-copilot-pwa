// GET  /api/pta/ballots — active ballot + participation rate + whether parent voted
// POST /api/pta/ballots — create ballot (principal only)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const svc = createAdminSupabaseClient()

  const { data: ballot } = await svc
    .from('pta_ballots')
    .select('id, title, description, options, closing_at, min_fee_percent, status')
    .eq('school_id', parent.schoolId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!ballot) return NextResponse.json({ ballot: null })

  type BallotRow = {
    id: string; title: string; description: string | null
    options: string[]; closing_at: string; min_fee_percent: number; status: string
  }
  const b = ballot as BallotRow

  const [{ data: myVote }, { count: totalVotes }, { count: totalParents }] = await Promise.all([
    svc.from('pta_votes')
      .select('vote_choice')
      .eq('ballot_id', b.id)
      .eq('parent_phone', parent.phone)
      .maybeSingle(),

    svc.from('pta_votes')
      .select('id', { count: 'exact', head: true })
      .eq('ballot_id', b.id),

    svc.from('students')
      .select('parent_phone', { count: 'exact', head: true })
      .eq('school_id', parent.schoolId)
      .eq('is_active', true)
      .not('parent_phone', 'is', null),
  ])

  const hasVoted   = !!myVote
  const myChoice   = (myVote as { vote_choice: string } | null)?.vote_choice ?? null
  const participation = totalParents
    ? Math.round(((totalVotes ?? 0) / totalParents) * 100)
    : 0

  return NextResponse.json({
    ballot: b,
    hasVoted,
    myChoice,
    participation,
    totalVotes: totalVotes ?? 0,
  })
}

export async function POST(req: NextRequest) {
  // Staff-only — uses Supabase session token in Authorization header
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createAdminSupabaseClient()
  const { data: { user } } = await svc.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: staff } = await svc
    .from('staff_records')
    .select('school_id, sub_role')
    .eq('user_id', user.id)
    .single()

  type StaffRow = { school_id: string; sub_role: string | null }
  const sr = staff as StaffRow | null
  if (!sr || sr.sub_role !== 'principal') {
    return NextResponse.json({ error: 'Only the principal can create PTA ballots' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as {
    title?: string
    description?: string
    options?: string[]
    closing_at?: string
    min_fee_percent?: number
  }

  if (!body.title?.trim() || !Array.isArray(body.options) || body.options.length < 2 || !body.closing_at) {
    return NextResponse.json(
      { error: 'title, options (min 2), and closing_at required' },
      { status: 400 }
    )
  }

  const { data, error } = await svc
    .from('pta_ballots')
    .insert({
      school_id:       sr.school_id,
      title:           body.title.trim(),
      description:     body.description?.trim() ?? null,
      options:         body.options,
      closing_at:      body.closing_at,
      min_fee_percent: body.min_fee_percent ?? 0,
      status:          'active',
      created_by:      user.id,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create ballot' }, { status: 500 })

  return NextResponse.json({ created: true, ballotId: (data as { id: string }).id }, { status: 201 })
}
