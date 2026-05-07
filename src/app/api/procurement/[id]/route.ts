// GET /api/procurement/[id] — full document detail with line items and price analysis

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set([
  'accountant','storekeeper','principal','deputy_principal',
  'deputy_principal_admin','dean_of_studies',
])

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = createAdminSupabaseClient()

  const { data: doc, error } = await db
    .from('procurement_documents')
    .select(`
      *,
      suppliers ( id, name, trust_score, total_orders, total_spend_kes, phone, email ),
      uploaded_staff:staff_records!uploaded_by ( full_name ),
      verified_staff:staff_records!verified_by ( full_name ),
      approved_staff:staff_records!approved_by ( full_name )
    `)
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const { data: lineItems } = await db
    .from('procurement_line_items')
    .select('*')
    .eq('document_id', id)
    .order('created_at')

  // Generate signed URL for the file
  let fileUrl: string | null = null
  if ((doc as { file_path?: string }).file_path) {
    const { data: su } = await db.storage
      .from('procurement-docs')
      .createSignedUrl((doc as { file_path: string }).file_path, 300)
    fileUrl = su?.signedUrl ?? null
  }

  return NextResponse.json({ document: { ...doc, file_url: fileUrl }, lineItems: lineItems ?? [] })
}
