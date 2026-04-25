// GET  /api/alumni/donations — list donations per project
// POST /api/alumni/donations — record a donation (M-Pesa ref)
// Alumni donations are NEVER deleted — only soft status. alumni table: no DELETE.

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const projectId = req.nextUrl.searchParams.get('project_id')
  const db        = svc()

  let query = db
    .from('alumni_donations')
    .select('id, alumni_id, project_id, amount, mpesa_ref, donated_at, anonymous, alumni(full_name, graduation_year, university)')
    .eq('school_id', auth.schoolId!)
    .order('donated_at', { ascending: false })
    .limit(100)

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  return NextResponse.json({ donations: data ?? [] })
}

export async function POST(req: NextRequest) {
  // Called by M-Pesa callback or manual entry by principal
  const db   = svc()
  const body = await req.json() as {
    school_id:   string
    project_id:  string
    alumni_id?:  string   // null if anonymous
    amount:      number
    mpesa_ref?:  string
    anonymous?:  boolean
    secret?:     string   // internal secret for M-Pesa callback path
  }

  // Allow internal M-Pesa callback OR authenticated principal
  const isInternal = body.secret === process.env.INTERNAL_API_SECRET
  if (!isInternal) {
    // Require auth
    const auth = await requireAuth()
    if (auth && 'unauthorized' in auth && auth.unauthorized) return auth.unauthorized as Response
  }

  if (!body.school_id || !body.project_id || !body.amount) {
    return NextResponse.json({ error: 'school_id, project_id, amount required' }, { status: 400 })
  }

  // Verify project exists and is active
  const { data: project } = await db
    .from('donation_projects')
    .select('id, target_amount, raised_amount, status')
    .eq('id', body.project_id)
    .eq('school_id', body.school_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if ((project as { status: string }).status !== 'active') {
    return NextResponse.json({ error: 'Project is not active' }, { status: 409 })
  }

  // Check duplicate M-Pesa ref
  if (body.mpesa_ref) {
    const { data: dup } = await db
      .from('alumni_donations')
      .select('id')
      .eq('mpesa_ref', body.mpesa_ref)
      .single()
    if (dup) return NextResponse.json({ error: 'Duplicate M-Pesa reference', id: (dup as { id: string }).id }, { status: 409 })
  }

  // Insert donation (NEVER deleted — permanent audit trail)
  const { data: donation, error } = await db
    .from('alumni_donations')
    .insert({
      school_id:  body.school_id,
      alumni_id:  body.alumni_id  ?? null,
      project_id: body.project_id,
      amount:     body.amount,
      mpesa_ref:  body.mpesa_ref  ?? null,
      anonymous:  body.anonymous  ?? false,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  // Update project raised_amount
  const p = project as { raised_amount: number; target_amount: number }
  const newRaised = p.raised_amount + body.amount
  await db.from('donation_projects').update({
    raised_amount: newRaised,
    status: newRaised >= p.target_amount ? 'completed' : 'active',
  }).eq('id', body.project_id)

  return NextResponse.json({ ok: true, donation_id: (donation as { id: string }).id, new_total: newRaised })
}
