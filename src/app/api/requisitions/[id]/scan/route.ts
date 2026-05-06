// POST /api/requisitions/[id]/scan
// Accepts a base64 image, calls the process-document edge function with
// ocr_aie_form task, returns parsed line items for pre-filling the form.

import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params

  // Gate: ensure the requisition exists and belongs to this school
  const db = createAdminSupabaseClient()
  const { data: form } = await db
    .from('aie_forms')
    .select('id')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .maybeSingle()

  if (!form) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { base64, mimeType } = body as { base64?: string; mimeType?: string }

  if (!base64) {
    return NextResponse.json({ error: 'base64 image required' }, { status: 400 })
  }

  // Re-use the Authorization header from the incoming request
  const authHeader = req.headers.get('authorization') ?? ''

  const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-document`

  const res = await fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify({ base64, mimeType: mimeType ?? 'image/jpeg', task: 'ocr_aie_form' }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    console.error('[scan] edge function error:', res.status, txt.slice(0, 200))
    return NextResponse.json({ error: 'OCR service error' }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
