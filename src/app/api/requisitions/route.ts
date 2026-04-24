// GET  /api/requisitions — list requisitions filtered by role
// POST /api/requisitions — create new requisition (any staff role)
//
// Role visibility:
//   principal   → ALL
//   bursar      → ALL (accounts section)
//   hod / hod_* → own department
//   storekeeper → approved (ready to fulfill)
//   teacher/any → own submissions only

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

type RequisitionItem = {
  itemName: string
  unit: string
  quantity: number
  unitCost: number
}

type StaffRow = {
  id: string
  sub_role: string
  department: string | null
  full_name: string | null
}

async function getStaff(db: ReturnType<typeof svc>, userId: string, schoolId: string): Promise<StaffRow | null> {
  const { data } = await db
    .from('staff_records')
    .select('id, sub_role, department, full_name')
    .eq('user_id', userId)
    .eq('school_id', schoolId)
    .single()
  return (data as StaffRow | null)
}

function generateReqNumber(schoolCode: string, seq: number, year: number): string {
  const pad = String(seq).padStart(4, '0')
  return `REQ-${year}-${schoolCode}-${pad}`
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db    = svc()
  const staff = await getStaff(db, auth.userId!, auth.schoolId!)
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const statusFilter = req.nextUrl.searchParams.get('status')
  const role = staff.sub_role

  let query = db
    .from('aie_forms')
    .select('id, form_number, requested_by, department, date, total_amount, status, created_at, approved_at, notes')
    .eq('school_id', auth.schoolId!)
    .order('created_at', { ascending: false })
    .limit(200)

  if (['principal', 'bursar', 'deputy_principal', 'deputy_admin'].includes(role)) {
    // See all
  } else if (role === 'storekeeper') {
    query = query.in('status', statusFilter ? [statusFilter] : ['approved'])
  } else if (role.startsWith('hod') || role === 'department_head') {
    if (staff.department) query = query.eq('department', staff.department)
    else query = query.eq('created_by', staff.id)
  } else {
    query = query.eq('created_by', staff.id)
  }

  if (statusFilter && role !== 'storekeeper') query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) {
    console.error('[requisitions GET]', error.message)
    return NextResponse.json({ error: 'Failed to load requisitions' }, { status: 500 })
  }

  return NextResponse.json({ requisitions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = svc()
  const staff = await getStaff(db, auth.userId!, auth.schoolId!)
  if (!staff) return NextResponse.json({ error: 'No staff record' }, { status: 403 })

  const body = await req.json().catch(() => null) as {
    title: string
    department: string
    items: RequisitionItem[]
    urgency?: 'low' | 'medium' | 'high' | 'critical'
    deadline?: string
    subjectId?: string
    notes?: string
  } | null

  if (!body?.title || !body.department || !body.items?.length) {
    return NextResponse.json({ error: 'title, department, and items required' }, { status: 400 })
  }
  if (body.items.some(i => !i.itemName || !i.unit || i.quantity <= 0 || i.unitCost < 0)) {
    return NextResponse.json({ error: 'Each item needs itemName, unit, quantity > 0, unitCost >= 0' }, { status: 400 })
  }

  // Get current sequence count for school
  const { count } = await db
    .from('aie_forms')
    .select('id', { count: 'exact', head: true })
    .eq('school_id', auth.schoolId!)

  const seq   = (count ?? 0) + 1
  const year  = new Date().getFullYear()

  // Fetch school short code for the form number
  const { data: tenantRow } = await db
    .from('tenant_configs')
    .select('school_short_code')
    .eq('school_id', auth.schoolId!)
    .single()
  const schoolCode = (tenantRow as { school_short_code: string } | null)?.school_short_code ?? 'SCH'

  const formNumber  = generateReqNumber(schoolCode, seq, year)
  const totalAmount = body.items.reduce((sum, i) => sum + i.unitCost * i.quantity, 0)

  const { data, error } = await db.from('aie_forms').insert({
    school_id:    auth.schoolId,
    form_number:  formNumber,
    requested_by: staff.full_name ?? auth.userId,
    department:   body.department,
    date:         new Date().toISOString().split('T')[0],
    items: body.items.map((i, idx) => ({
      description: i.itemName,
      unit:        i.unit,
      quantity:    i.quantity,
      amount:      i.unitCost,
    })),
    total_amount: totalAmount,
    created_by:   staff.id,
    notes:        body.notes ?? null,
    status:       'pending',
  }).select('id, form_number, status, total_amount').single()

  if (error) {
    console.error('[requisitions POST]', error.message)
    return NextResponse.json({ error: 'Failed to create requisition' }, { status: 500 })
  }

  return NextResponse.json({ ...data, requisition_number: formNumber }, { status: 201 })
}
