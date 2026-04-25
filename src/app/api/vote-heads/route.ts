// GET  /api/vote-heads — principal only: list vote-heads with balances
// POST /api/vote-heads — principal only: create or initialise FDSE vote-heads
//   body { fdse_total, n_learners, academic_year, term } → auto-splits into 4 buckets
//   OR body { name, code, category, allocated_amount, academic_year, term } → manual

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// FDSE per-learner allocations (Kenya MoE rates)
const FDSE_RATES = [
  { name: 'RMI',      code: 'RMI',      category: 'Operations', rate: 2047.71 },
  { name: 'Activity', code: 'ACT',      category: 'Operations', rate: 250.00  },
  { name: 'Tuition',  code: 'TUI',      category: 'Operations', rate: 1049.69 },
  { name: 'KICD',     code: 'KICD',     category: 'Operations', rate: 795.67  },
]

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const term = req.nextUrl.searchParams.get('term')
  const year = req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear())

  let query = db
    .from('vote_heads')
    .select('id, name, code, category, allocated_amount, spent_amount, academic_year, term')
    .eq('school_id', auth.schoolId!)
    .eq('academic_year', year)
    .order('category')
    .order('name')

  if (term) query = query.eq('term', Number(term))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Attach recent transactions
  const ids = (data ?? []).map((v: { id: string }) => v.id)
  let txData: unknown[] = []
  if (ids.length > 0) {
    const { data: tx } = await db
      .from('vote_head_transactions')
      .select('id, from_vote_head_id, to_vote_head_id, amount, justification, is_cross_category, created_at')
      .eq('school_id', auth.schoolId!)
      .in('from_vote_head_id', ids)
      .order('created_at', { ascending: false })
      .limit(50)
    txData = tx ?? []
  }

  return NextResponse.json({ vote_heads: data ?? [], transactions: txData })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    // FDSE auto-split mode
    fdse_total?:     number
    n_learners?:     number
    // Manual mode
    name?:           string
    code?:           string
    category?:       string
    allocated_amount?: number
    // Common
    academic_year:   string
    term:            number
  }

  if (!body.academic_year || !body.term) {
    return NextResponse.json({ error: 'academic_year and term required' }, { status: 400 })
  }

  if (body.fdse_total != null) {
    // FDSE auto-split
    const nLearners = body.n_learners ?? (() => {
      // Will fetch from students table if not provided
      return null
    })()

    let n = nLearners
    if (!n) {
      const { count } = await db
        .from('students')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', auth.schoolId!)
        .eq('is_active', true)
      n = count ?? 0
    }

    if (!n) return NextResponse.json({ error: 'No enrolled students found — provide n_learners' }, { status: 400 })

    const rows = FDSE_RATES.map(r => ({
      school_id:        auth.schoolId,
      name:             r.name,
      code:             r.code,
      category:         r.category,
      allocated_amount: Math.round(r.rate * n! * 100) / 100,
      spent_amount:     0,
      academic_year:    body.academic_year,
      term:             body.term,
    }))

    // Upsert — if vote-heads already exist for this term/year, update allocated_amount
    const { data, error } = await db.from('vote_heads').upsert(rows, {
      onConflict: 'school_id,code,academic_year,term',
      ignoreDuplicates: false,
    }).select('id, name, allocated_amount')

    if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    return NextResponse.json({ created: data?.length ?? 0, n_learners: n, vote_heads: data })
  }

  // Manual single vote-head
  if (!body.name || !body.code || body.allocated_amount == null) {
    return NextResponse.json({ error: 'name, code, allocated_amount required for manual mode' }, { status: 400 })
  }

  const { data, error } = await db.from('vote_heads').insert({
    school_id:        auth.schoolId,
    name:             body.name,
    code:             body.code,
    category:         body.category ?? 'Operations',
    allocated_amount: body.allocated_amount,
    spent_amount:     0,
    academic_year:    body.academic_year,
    term:             body.term,
  }).select('id').single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id })
}
