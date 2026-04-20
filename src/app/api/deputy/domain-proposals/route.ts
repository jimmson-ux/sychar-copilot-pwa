// GET    /api/deputy/domain-proposals          — list proposals for school
// POST   /api/deputy/domain-proposals          — create a new proposal
// PATCH  /api/deputy/domain-proposals?id=<id>  — approve/decline a proposal

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const REQUESTER_ROLES = [
  'deputy_principal_academic',
  'deputy_principal_academics',
  'deputy_principal_admin',
  'deputy_principal_discipline',
]

const RESOLVER_ROLES = [
  'deputy_principal_academic',
  'deputy_principal_academics',
  'deputy_principal_admin',
  'deputy_principal_discipline',
  'principal',
]

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId } = auth
  const db = serviceClient()
  const status = req.nextUrl.searchParams.get('status')

  let query = db
    .from('domain_proposals')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proposals: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!REQUESTER_ROLES.includes(subRole)) {
    return NextResponse.json(
      { error: 'Only deputy principals can create domain proposals' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { target_domain, action_type, payload } = body as {
    target_domain?: string
    action_type?: string
    payload?: Record<string, unknown>
  }

  if (!target_domain || !action_type) {
    return NextResponse.json(
      { error: 'target_domain and action_type are required' },
      { status: 400 }
    )
  }

  const db = serviceClient()

  const { data, error } = await db
    .from('domain_proposals')
    .insert({
      school_id: schoolId,
      requester_id: userId,
      target_domain,
      action_type,
      payload: payload ?? {},
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proposal: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!RESOLVER_ROLES.includes(subRole)) {
    return NextResponse.json(
      { error: 'Not authorised to resolve domain proposals' },
      { status: 403 }
    )
  }

  const proposalId = req.nextUrl.searchParams.get('id')
  if (!proposalId) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const { status, remarks } = body as { status?: string; remarks?: string }

  if (!status || !['approved', 'declined'].includes(status)) {
    return NextResponse.json(
      { error: 'status must be approved or declined' },
      { status: 400 }
    )
  }

  const db = serviceClient()

  // Fetch the proposal first — the requester cannot resolve their own proposal
  const { data: existing, error: fetchErr } = await db
    .from('domain_proposals')
    .select('requester_id, status')
    .eq('id', proposalId)
    .eq('school_id', schoolId)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 })
  }

  if (existing.status !== 'pending') {
    return NextResponse.json({ error: 'Proposal already resolved' }, { status: 409 })
  }

  if (existing.requester_id === userId && subRole !== 'principal') {
    return NextResponse.json(
      { error: 'You cannot resolve your own proposal' },
      { status: 403 }
    )
  }

  const auditRemark = `[${status.toUpperCase()} by ${subRole} at ${new Date().toISOString()}]${remarks ? ': ' + remarks : ''}`

  const { data, error } = await db
    .from('domain_proposals')
    .update({
      status,
      remarks: auditRemark,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq('id', proposalId)
    .eq('school_id', schoolId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ proposal: data })
}
