// GET /api/procurement — list procurement documents with filters
// Accessible by: accountant, storekeeper, principal, deputy_principal, dean_of_studies

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set([
  'accountant','storekeeper','principal','deputy_principal',
  'deputy_principal_admin','dean_of_studies',
])

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status')
  const supplierId = searchParams.get('supplierId')
  const dateFrom   = searchParams.get('dateFrom')
  const dateTo     = searchParams.get('dateTo')
  const page       = parseInt(searchParams.get('page') ?? '1', 10)
  const limit      = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100)
  const offset     = (page - 1) * limit

  const db = createAdminSupabaseClient()

  let query = db
    .from('procurement_summary_view')
    .select('*', { count: 'exact' })
    .eq('school_id', auth.schoolId!)
    .order('uploaded_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status)     query = query.eq('workflow_status', status)
  if (supplierId) query = query.eq('supplier_id', supplierId)
  if (dateFrom)   query = query.gte('extracted_date', dateFrom)
  if (dateTo)     query = query.lte('extracted_date', dateTo)

  const { data, count, error } = await query
  if (error) {
    console.error('[procurement] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to fetch procurement documents' }, { status: 500 })
  }

  // Summary stats
  const { data: stats } = await db
    .from('procurement_summary_view')
    .select('workflow_status, computed_total_kes')
    .eq('school_id', auth.schoolId!)

  const summary = {
    total_documents:  count ?? 0,
    pending_approval: stats?.filter(s => s.workflow_status === 'pending_approval').length ?? 0,
    total_spend_kes:  stats?.reduce((s, r) => s + (Number(r.computed_total_kes) || 0), 0) ?? 0,
    discrepancies:    stats?.filter(s => s.workflow_status === 'discrepancy_raised').length ?? 0,
  }

  return NextResponse.json({ documents: data, summary, total: count, page, limit })
}
