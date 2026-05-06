// POST /api/requisitions/pre-scan
// OCR scan for the HOD "New Requisition" modal — no existing form ID needed.
// Image is forwarded to the process-document edge function with task=ocr_aie_form.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

const CREATOR_ROLES = new Set([
  'principal', 'deputy_principal', 'deputy_principal_admin', 'deputy_principal_discipline',
  'hod_sciences', 'hod_mathematics', 'hod_languages', 'hod_humanities',
  'hod_applied_sciences', 'hod_games_sports', 'dean_of_studies', 'deputy_dean',
])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!CREATOR_ROLES.has(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { base64?: string; mimeType?: string }

  if (!body.base64) {
    return NextResponse.json({ error: 'base64 image required' }, { status: 400 })
  }

  const authHeader = req.headers.get('authorization') ?? ''
  const edgeUrl    = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-document`

  const res = await fetch(edgeUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body:    JSON.stringify({ base64: body.base64, mimeType: body.mimeType ?? 'image/jpeg', task: 'ocr_aie_form' }),
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    console.error('[pre-scan] edge function error:', res.status, txt.slice(0, 200))
    return NextResponse.json({ error: 'OCR service error' }, { status: 502 })
  }

  return NextResponse.json(await res.json())
}
