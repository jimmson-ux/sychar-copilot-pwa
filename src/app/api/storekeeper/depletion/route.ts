// GET /api/storekeeper/depletion?threshold=80
// Returns items from storekeeper_depletion_view above the given depletion %.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_ROLES = ['storekeeper', 'principal', 'deputy_principal', 'deputy_principal_admin', 'deputy_principal_discipline']

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId, subRole } = auth

  if (!ALLOWED_ROLES.includes(subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const threshold = Number(req.nextUrl.searchParams.get('threshold') ?? '0')
  const db = serviceClient()

  const { data, error } = await db
    .from('storekeeper_depletion_view')
    .select('*')
    .eq('school_id', schoolId)
    .gte('pct_fulfilled', threshold)
    .order('pct_fulfilled', { ascending: false })

  if (error) {
    console.error('[depletion]', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] })
}
