// GET  /api/welfare/vouchers?date=YYYY-MM-DD&class_name=   — list day's vouchers
// POST /api/welfare/vouchers                              — issue vouchers to a class
// PATCH /api/welfare/vouchers?id=                        — mark redeemed

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

const ALLOWED = new Set([
  'bursar', 'principal', 'deputy_principal', 'deputy_principal_admin', 'welfare_officer',
])

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId } = auth
  const sp        = req.nextUrl.searchParams
  const date      = sp.get('date') ?? new Date().toISOString().split('T')[0]
  const className = sp.get('class_name')

  let query = svc()
    .from('bread_vouchers')
    .select(`
      id, voucher_date, quantity, unit_cost, total_cost, redeemed, redeemed_at, created_at,
      students (id, full_name, admission_number, class_name)
    `)
    .eq('school_id', schoolId!)
    .eq('voucher_date', date)
    .order('created_at', { ascending: false })

  if (className) {
    // filter via related students table
    query = query.eq('students.class_name', className)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  return NextResponse.json({ vouchers: data ?? [], date })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ALLOWED.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as {
    class_name?: string
    student_ids?: string[]
    unit_cost?: number
    quantity?: number
    voucher_date?: string
  }

  const { schoolId, userId } = auth
  const db        = svc()
  const date      = body.voucher_date ?? new Date().toISOString().split('T')[0]
  const unitCost  = body.unit_cost ?? 30
  const qty       = body.quantity ?? 1

  let studentIds: string[] = body.student_ids ?? []

  if (studentIds.length === 0 && body.class_name) {
    const { data: students } = await db
      .from('students')
      .select('id')
      .eq('school_id', schoolId!)
      .eq('class_name', body.class_name)
      .eq('is_active', true)
    studentIds = (students ?? []).map((s: { id: string }) => s.id)
  }

  if (studentIds.length === 0) {
    return NextResponse.json({ error: 'No students found' }, { status: 400 })
  }

  const rows = studentIds.map(sid => ({
    school_id:    schoolId,
    student_id:   sid,
    voucher_date: date,
    quantity:     qty,
    unit_cost:    unitCost,
    issued_by:    userId,
  }))

  const { error } = await db
    .from('bread_vouchers')
    .upsert(rows, { onConflict: 'school_id,student_id,voucher_date' })

  if (error) {
    console.error('[welfare/vouchers] upsert error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: rows.length }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await svc()
    .from('bread_vouchers')
    .update({ redeemed: true, redeemed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('school_id', auth.schoolId!)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
