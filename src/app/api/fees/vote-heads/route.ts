// GET /api/fees/vote-heads
// Returns all 4 FDSE vote-heads for current school + current term,
// joined with transaction totals per head.
// Principal and bursar only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['principal', 'bursar'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: principal or bursar only' }, { status: 403 })
  }

  const db = svc()
  const month = new Date().getMonth() + 1
  const term  = req.nextUrl.searchParams.get('term') ?? String(month <= 4 ? 1 : month <= 8 ? 2 : 3)
  const year  = req.nextUrl.searchParams.get('year') ?? String(new Date().getFullYear())

  const { data: heads, error } = await db
    .from('vote_heads')
    .select('id, name, code, category, allocated_amount, spent_amount, academic_year, term')
    .eq('school_id', auth.schoolId!)
    .eq('academic_year', year)
    .eq('term', Number(term))
    .order('name')

  if (error) {
    console.error('[fees/vote-heads]', error.message)
    return NextResponse.json({ error: 'Failed to load vote-heads' }, { status: 500 })
  }

  const ids = (heads ?? []).map((h: { id: string }) => h.id)

  let transactions: Array<{ from_vote_head_id: string; to_vote_head_id: string; amount: number; justification: string; is_cross_category: boolean; created_at: string }> = []
  if (ids.length > 0) {
    const { data: tx } = await db
      .from('vote_head_transactions')
      .select('from_vote_head_id, to_vote_head_id, amount, justification, is_cross_category, created_at')
      .eq('school_id', auth.schoolId!)
      .in('from_vote_head_id', ids)
      .order('created_at', { ascending: false })
      .limit(100)
    transactions = (tx ?? []) as typeof transactions
  }

  return NextResponse.json({ vote_heads: heads ?? [], transactions, term, year })
}
