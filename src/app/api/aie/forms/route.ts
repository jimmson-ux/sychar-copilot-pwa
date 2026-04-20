// GET  /api/aie/forms — list AIE forms (all staff see own; principal sees all)
// POST /api/aie/forms — create a new AIE form

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db     = svc()
  const status = req.nextUrl.searchParams.get('status')

  const { data: staff } = await db
    .from('staff_records').select('id, sub_role').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  type StaffRow = { id: string; sub_role: string }
  const s = staff as StaffRow
  const isPrincipalOrBursar = ['principal', 'bursar'].includes(s.sub_role)

  let query = db
    .from('aie_forms')
    .select('id, form_number, requested_by, department, date, total_amount, status, created_at, approved_at, pdf_url')
    .eq('school_id', auth.schoolId!)
    .order('created_at', { ascending: false })
    .limit(100)

  // Non-principal sees only their own forms
  if (!isPrincipalOrBursar) query = query.eq('created_by', s.id)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ forms: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db   = svc()
  const body = await req.json() as {
    requested_by: string
    department:   string
    date?:        string
    tsc_number?:  string
    id_number?:   string
    items:        Array<{ description: string; unit: string; quantity: number; amount: number }>
    notes?:       string
  }

  if (!body.requested_by || !body.department || !body.items?.length) {
    return NextResponse.json({ error: 'requested_by, department, and items required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const total = body.items.reduce((sum, i) => sum + (i.amount * i.quantity), 0)

  const { data, error } = await db.from('aie_forms').insert({
    school_id:    auth.schoolId,
    requested_by: body.requested_by,
    department:   body.department,
    date:         body.date ?? new Date().toISOString().split('T')[0],
    tsc_number:   body.tsc_number ?? null,
    id_number:    body.id_number ?? null,
    items:        body.items,
    total_amount: total,
    created_by:   (staff as { id: string }).id,
    notes:        body.notes ?? null,
    status:       'pending',
  }).select('id, form_number').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
