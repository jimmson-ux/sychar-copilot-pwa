// POST /api/procurement/upload — bursar uploads invoice or delivery note photo/PDF
// Triggers async Gemini OCR via process-document edge function

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

const ALLOWED = new Set(['accountant', 'principal'])
const ALLOWED_MIME = new Set(['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
const MAX_BYTES = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) return NextResponse.json({ error: 'Forbidden — bursar or principal only' }, { status: 403 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file         = formData.get('file') as File | null
  const documentType = (formData.get('documentType') as string | null) ?? 'invoice'
  const requisitionId = formData.get('requisitionId') as string | null

  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 413 })
  }

  const db       = createAdminSupabaseClient()
  const now      = new Date()
  const year     = now.getFullYear()
  const month    = String(now.getMonth() + 1).padStart(2, '0')
  const uuid     = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const filePath = `${auth.schoolId}/${year}/${month}/${uuid}-${safeName}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { data: upload, error: uploadErr } = await db.storage
    .from('procurement-docs')
    .upload(filePath, buffer, { contentType: file.type, upsert: false })

  if (uploadErr) {
    console.error('[procurement/upload] storage error:', uploadErr.message)
    return NextResponse.json({ error: 'File upload failed' }, { status: 500 })
  }

  const { data: staffRecord } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  if (!staffRecord) return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })

  const { data: tc } = await db
    .from('tenant_configs')
    .select('current_term, current_year')
    .eq('school_id', auth.schoolId!)
    .single()

  const { data: doc, error: docErr } = await db
    .from('procurement_documents')
    .insert({
      school_id:       auth.schoolId,
      document_type:   documentType,
      file_path:       upload.path,
      mime_type:       file.type,
      file_size_bytes: file.size,
      ocr_status:      'processing',
      workflow_status: 'uploaded',
      uploaded_by:     (staffRecord as { id: string }).id,
      uploaded_at:     now.toISOString(),
      term:            (tc as { current_term?: number } | null)?.current_term ?? null,
      academic_year:   (tc as { current_year?: string } | null)?.current_year ?? String(year),
      requisition_id:  requisitionId ?? null,
    })
    .select('id')
    .single()

  if (docErr) {
    console.error('[procurement/upload] insert error:', docErr.message)
    return NextResponse.json({ error: 'Failed to create document record' }, { status: 500 })
  }

  const newDoc = doc as { id: string }

  // Fire-and-forget: async OCR via edge function
  db.functions.invoke('process-document', {
    body: {
      documentId: newDoc.id,
      schoolId:   auth.schoolId,
      task:       'invoice',
      filePath:   upload.path,
      bucket:     'procurement-docs',
    },
  }).then(({ error: fnErr }) => {
    if (fnErr) console.error('[procurement/upload] OCR invoke error:', fnErr.message)
  })

  return NextResponse.json({ documentId: newDoc.id, status: 'processing', filePath: upload.path })
}
