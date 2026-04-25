// GET   /api/hod/requisitions          — list requisitions for requester's dept
// POST  /api/hod/requisitions          — create a new requisition
// PATCH /api/hod/requisitions?id=<id>  — update status (approve/decline/etc.)

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const APPROVER_ROLES = ['principal', 'deputy_principal_admin', 'deputy_principal_discipline']

const CREATOR_ROLES_PREFIX = ['hod_']
const CREATOR_ROLES_EXACT  = ['dean_of_studies', 'deputy_dean_of_studies', 'principal']

function canCreate(subRole: string) {
  return CREATOR_ROLES_EXACT.includes(subRole) ||
    CREATOR_ROLES_PREFIX.some(p => subRole.startsWith(p))
}

const SUB_ROLE_TO_DEPT: Record<string, string> = {
  hod_sciences:        'Sciences',
  hod_mathematics:     'Mathematics',
  hod_languages:       'Languages',
  hod_humanities:      'Humanities',
  hod_applied_sciences:'Applied Sciences',
  hod_games_sports:    'Games & Sports',
}

async function resolveDepartment(
  db: ReturnType<typeof serviceClient>,
  userId: string,
  schoolId: string,
  subRole: string
): Promise<string> {
  const { data } = await db
    .from('staff_records')
    .select('department')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .single()
  return (data as { department?: string | null } | null)?.department?.trim() ||
    SUB_ROLE_TO_DEPT[subRole] ||
    'General'
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth
  const db = serviceClient()

  const department = await resolveDepartment(db, userId, schoolId, subRole)

  // Principal and approvers see all; others see only their dept
  const isApprover = APPROVER_ROLES.includes(subRole)

  let query = db
    .from('requisitions')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  if (!isApprover) {
    query = query.eq('department', department)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ requisitions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!canCreate(subRole)) {
    return NextResponse.json(
      { error: 'Only HODs, Deans, or Principal can create requisitions' },
      { status: 403 }
    )
  }

  const db = serviceClient()

  // Resolve the staff record id for requester_id (FK references staff_records.id)
  const { data: staffRow } = await db
    .from('staff_records')
    .select('id, department')
    .eq('school_id', schoolId)
    .eq('user_id', userId)
    .single()

  if (!staffRow) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { title, items, estimated_cost, currency, notes, academic_year, term } = body as {
    title?: string
    items?: unknown[]
    estimated_cost?: number
    currency?: string
    notes?: string
    academic_year?: string
    term?: number
  }

  if (!title || !items || !Array.isArray(items)) {
    return NextResponse.json(
      { error: 'title and items[] are required' },
      { status: 400 }
    )
  }

  const department = await resolveDepartment(db, userId, schoolId, subRole)

  const { data, error } = await db
    .from('requisitions')
    .insert({
      school_id:      schoolId,
      requester_id:   (staffRow as { id: string }).id,
      department,
      title,
      items,
      estimated_cost: estimated_cost ?? null,
      currency:       currency ?? 'KES',
      notes:          notes ?? null,
      academic_year:  academic_year ?? null,
      term:           term ?? null,
      status:         'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ requisition: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!APPROVER_ROLES.includes(subRole)) {
    return NextResponse.json(
      { error: 'Only Principal or Admin can update requisition status' },
      { status: 403 }
    )
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { status, notes } = body as { status?: string; notes?: string }

  const VALID_STATUSES = ['pending','approved','declined','fulfilled','received','closed']
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const db = serviceClient()

  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  }

  if (notes) update.notes = notes
  if (status === 'approved') {
    update.approved_by = userId
    update.approved_at = new Date().toISOString()
  }
  if (status === 'fulfilled') update.fulfilled_at = new Date().toISOString()
  if (status === 'received')  update.received_at  = new Date().toISOString()

  const { data, error } = await db
    .from('requisitions')
    .update(update)
    .eq('id', id)
    .eq('school_id', schoolId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ requisition: data })
}
