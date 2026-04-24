// POST /api/schools/register
// Creates a new school + first admin staff record in one atomic transaction.
// Protected: requires a valid Bearer token that matches SCHOOL_REGISTRATION_SECRET.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const secret = process.env.SCHOOL_REGISTRATION_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { school_name, county, admin_user_id, admin_name, admin_email, admin_role } = body

  if (!school_name || !admin_user_id || !admin_name || !admin_email) {
    return NextResponse.json(
      { error: 'Required fields: school_name, admin_user_id, admin_name, admin_email' },
      { status: 422 }
    )
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Register the school — RPC returns school_id
  const { data: schoolId, error } = await serviceClient.rpc('register_school', {
    p_school_name:   school_name,
    p_county:        county ?? null,
    p_admin_user_id: admin_user_id,
    p_admin_name:    admin_name,
    p_admin_email:   admin_email,
    p_admin_role:    admin_role ?? 'principal',
  })

  if (error) {
    console.error('[register_school]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch the auto-generated short code for the welcome email
  // school_id resolved dynamically from session
  const { data: tenant } = await serviceClient
    .from('tenant_configs')
    .select('school_short_code')
    .eq('school_id', schoolId)
    .single()

  return NextResponse.json(
    {
      school_id:         schoolId,
      school_short_code: tenant?.school_short_code ?? null,
    },
    { status: 201 }
  )
}
