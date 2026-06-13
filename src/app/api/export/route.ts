import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { toCSV, toXLSX, type Column } from '@/lib/export'

export const dynamic = 'force-dynamic'

/**
 * GET /api/export?dataset=…&format=csv|xlsx — Data Export Centre. Whitelisted, school-
 * scoped datasets to CSV/Excel. Leadership/finance/secretary only. (PDF exports go via
 * the generate-pdf branded renderer per document.)
 */
const DATASETS: Record<string, { table: string; columns: Column[]; roles: Set<string> }> = {
  students: {
    table: 'students',
    columns: [['admission_no', 'Admission No'], ['full_name', 'Name'], ['class_name', 'Class'], ['gender', 'Gender'], ['is_active', 'Active']],
    roles: new Set(['principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'secretary']),
  },
  fee_payments: {
    table: 'fee_payments',
    columns: [['student_id', 'Student'], ['amount', 'Amount'], ['payment_method', 'Method'], ['mpesa_code', 'Ref'], ['payment_date', 'Date']],
    roles: new Set(['principal', 'bursar', 'accounts_clerk', 'super_admin']),
  },
  payment_claims: {
    table: 'payment_claims',
    columns: [['admission_no', 'Admission'], ['amount', 'Amount'], ['method', 'Method'], ['transaction_code', 'Code'], ['status', 'Status'], ['created_at', 'Submitted']],
    roles: new Set(['principal', 'bursar', 'accounts_clerk', 'super_admin']),
  },
  attendance_records: {
    table: 'attendance_records',
    columns: [['student_name', 'Student'], ['class_name', 'Class'], ['date', 'Date'], ['status', 'Status'], ['reason', 'Reason']],
    roles: new Set(['principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin', 'secretary']),
  },
  staff_records: {
    table: 'staff_records',
    columns: [['full_name', 'Name'], ['sub_role', 'Role'], ['phone', 'Phone'], ['department', 'Department'], ['employment_type', 'Type']],
    roles: new Set(['principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin', 'secretary']),
  },
  suppliers: {
    table: 'suppliers',
    columns: [['name', 'Supplier'], ['contact_person', 'Contact'], ['phone', 'Phone'], ['supplies_categories', 'Categories'], ['is_active', 'Active']],
    roles: new Set(['principal', 'procurement_officer', 'bursar', 'storekeeper', 'super_admin']),
  },
  maintenance_requests: {
    table: 'maintenance_requests',
    columns: [['location', 'Location'], ['category', 'Category'], ['description', 'Description'], ['priority', 'Priority'], ['status', 'Status'], ['created_at', 'Reported']],
    roles: new Set(['principal', 'deputy_principal', 'deputy_principal_admin', 'super_admin', 'secretary', 'storekeeper']),
  },
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const url = new URL(req.url)
  const dataset = url.searchParams.get('dataset') ?? ''
  const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  const def = DATASETS[dataset]
  if (!def) return NextResponse.json({ error: `Unknown dataset. Allowed: ${Object.keys(DATASETS).join(', ')}` }, { status: 400 })
  if (!def.roles.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden for your role' }, { status: 403 })

  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from(def.table)
    .select(def.columns.map(([k]) => k).join(',')).eq('school_id', auth.schoolId).limit(10000)
  if (error) return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  const rows = ((data ?? []) as unknown as Record<string, unknown>[])
  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'csv') {
    return new NextResponse(toCSV(rows, def.columns), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${dataset}_${stamp}.csv"` },
    })
  }
  const buf = toXLSX(rows, def.columns)
  return new NextResponse(Buffer.from(buf), {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${dataset}_${stamp}.xlsx"` },
  })
}
