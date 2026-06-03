// POST /api/finance/allocate-funds
// Executes waterfall allocation: distributes a confirmed payment across the
// student's open invoices in category priority order (lowest priority # first).
// Bursar / principal only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['bursar', 'principal', 'deputy_principal', 'accountant'])

interface ConfirmedRow {
  student_id:  string
  amount:      number
  description: string
  date?:       string
  ref?:        string
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`allocate:${ip}`, LIMITS.FEE_RECORD.max, LIMITS.FEE_RECORD.window)
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Bursar or principal access required' }, { status: 403 })
  }

  let body: {
    rows: ConfirmedRow[]
    file_name?: string
  } = { rows: [] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.rows?.length) {
    return NextResponse.json({ error: 'No confirmed rows provided' }, { status: 400 })
  }

  const db = svc()
  const schoolId = auth.schoolId!

  // Create import record
  const { data: importRow } = await db
    .from('bank_statement_imports')
    .insert({
      school_id:   schoolId,
      imported_by: auth.userId,
      row_count:   body.rows.length,
      file_name:   body.file_name ?? null,
    })
    .select('id')
    .single()

  const importId = importRow?.id ?? null

  // Fetch fee categories for school sorted by priority
  const { data: cats } = await db
    .from('fee_categories')
    .select('id, name, priority')
    .eq('school_id', schoolId)
    .order('priority', { ascending: true })

  const results: Array<{
    student_id:   string
    amount:       number
    allocated:    number
    unallocated:  number
    breakdown:    Array<{ category: string; amount: number }>
    error?:       string
  }> = []

  let totalAllocated = 0

  for (const row of body.rows) {
    if (!row.student_id || row.amount <= 0) continue

    // Fetch open invoices for this student sorted by category priority
    const { data: invoices, error: iErr } = await db
      .from('invoices')
      .select('id, category_id, category_name, amount_due, amount_paid')
      .eq('school_id', schoolId)
      .eq('student_id', row.student_id)
      .order('id') // secondary order; primary is by category priority

    if (iErr) {
      results.push({ student_id: row.student_id, amount: row.amount, allocated: 0, unallocated: row.amount, breakdown: [], error: iErr.message })
      continue
    }

    // Sort invoices by category priority (join via cats map)
    const catPriority = new Map((cats ?? []).map((c: any) => [c.id, c.priority]))
    const sorted = [...(invoices ?? [])].sort((a: any, b: any) => {
      const pa = catPriority.get(a.category_id) ?? 99
      const pb = catPriority.get(b.category_id) ?? 99
      return pa - pb
    })

    let remaining = row.amount
    const breakdown: Array<{ category: string; amount: number }> = []

    for (const inv of sorted) {
      if (remaining <= 0) break
      const owed = Number(inv.amount_due) - Number(inv.amount_paid)
      if (owed <= 0) continue
      const allocation = Math.min(remaining, owed)

      const { error: uErr } = await db
        .from('invoices')
        .update({ amount_paid: Number(inv.amount_paid) + allocation })
        .eq('id', inv.id)

      if (!uErr) {
        // Log allocation
        await db.from('payment_allocations').insert({
          school_id:        schoolId,
          student_id:       row.student_id,
          invoice_id:       inv.id,
          import_id:        importId,
          category_name:    inv.category_name,
          amount:           allocation,
          transaction_ref:  row.ref ?? null,
          transaction_date: row.date ?? null,
        }).then(undefined, () => null)

        breakdown.push({ category: inv.category_name, amount: allocation })
        remaining -= allocation
        totalAllocated += allocation
      }
    }

    results.push({
      student_id:  row.student_id,
      amount:      row.amount,
      allocated:   row.amount - remaining,
      unallocated: remaining,
      breakdown,
    })
  }

  // Update import row with final tallies
  if (importId) {
    await db.from('bank_statement_imports').update({
      matched:      results.filter((r) => r.allocated > 0).length,
      unmatched:    results.filter((r) => r.allocated === 0).length,
      total_credit: body.rows.reduce((s, r) => s + (r.amount || 0), 0),
      allocated:    totalAllocated,
    }).eq('id', importId).then(undefined, () => null)
  }

  return NextResponse.json({ ok: true, results, totalAllocated, importId })
}
