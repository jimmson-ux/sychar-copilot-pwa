import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nurse/summary?scope=students|staff&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Principal-facing summaries of nurse activity.
 *   scope=students → common illnesses WITH student names/class/admission (minors).
 *   scope=staff    → AGGREGATE counts only (doctor–patient confidentiality: NO names).
 */
const VIEW_ROLES = new Set(['nurse', 'principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!VIEW_ROLES.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(req.url)
  const scope = url.searchParams.get('scope') ?? 'students'
  const from = url.searchParams.get('from') || undefined
  const to = url.searchParams.get('to') || undefined

  const svc = createAdminSupabaseClient()

  if (scope === 'staff') {
    // Aggregate only — never returns identities.
    const { data, error } = await svc.rpc('nurse_staff_summary', {
      p_school_id: auth.schoolId, ...(from ? { p_from: from } : {}), ...(to ? { p_to: to } : {}),
    })
    if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
    const rows = (data as { complaint: string; visits: number }[] ?? [])
    return NextResponse.json({
      scope: 'staff',
      confidential: true,
      total_visits: rows.reduce((s, r) => s + Number(r.visits), 0),
      common_illnesses: rows,
      note: 'Staff patient identities are confidential and intentionally omitted.',
    })
  }

  const { data, error } = await svc.rpc('nurse_student_summary', {
    p_school_id: auth.schoolId, ...(from ? { p_from: from } : {}), ...(to ? { p_to: to } : {}),
  })
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  const rows = (data as { complaint: string; visits: number; students: unknown }[] ?? [])
  return NextResponse.json({
    scope: 'students',
    total_visits: rows.reduce((s, r) => s + Number(r.visits), 0),
    common_illnesses: rows,
  })
}
