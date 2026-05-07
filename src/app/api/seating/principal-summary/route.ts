// GET /api/seating/principal-summary
// Returns school-wide seating intelligence summary for the principal dashboard.
// Access restricted to principal, deputy, dean, and qaso roles.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set([
  'principal','deputy_principal','deputy_principal_admin',
  'deputy_principal_discipline','dean_of_studies','deputy_dean','qaso',
])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ALLOWED.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden — principal or dean required' }, { status: 403 })
  }

  const sp   = req.nextUrl.searchParams
  const term = parseInt(sp.get('term') ?? '2')
  const year = sp.get('year') ?? '2025/2026'

  const db = createAdminSupabaseClient()

  const [summaryRes, detailRes] = await Promise.all([
    db.from('principal_seating_summary')
      .select('*')
      .eq('school_id', auth.schoolId)
      .eq('term', term)
      .eq('academic_year', year)
      .maybeSingle(),

    db.from('seating_intelligence')
      .select(`
        class_name, stream_name, risk_count, urgent_move_count,
        class_summary, principal_summary, recommended_moves, computed_at,
        discipline_records_count, marks_records_count
      `)
      .eq('school_id', auth.schoolId)
      .eq('term', term)
      .eq('academic_year', year)
      .order('risk_count', { ascending: false })
      .order('computed_at', { ascending: false }),
  ])

  // Also return total seat map count (shows how many classes have been set up)
  const { count: totalMaps } = await db
    .from('classroom_seat_maps')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', auth.schoolId)
    .eq('term', term)
    .eq('is_active', true)

  return NextResponse.json({
    summary:       summaryRes.data ?? null,
    class_details: detailRes.data ?? [],
    has_data:      !!summaryRes.data,
    total_seat_maps: totalMaps ?? 0,
    term,
    academic_year: year,
  })
}
