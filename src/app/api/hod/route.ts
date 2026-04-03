// GET /api/hod
// Returns streams, subjects, performance aggregates, and syllabus coverage
// for the HOD dashboard.
export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { fetchHodData } from '@/lib/hodData'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const sb = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  try {
    const data = await fetchHodData(sb, auth.schoolId)
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[hod] fetchHodData error:', msg)
    return NextResponse.json({ error: 'Failed to load HOD data' }, { status: 500 })
  }
}
