// POST /api/diary/seal — principal only
// Seals the diary for a given date: SHA-256 hash + court-ready PDF + immutable lock.

export const dynamic = 'force-dynamic'

import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as { date?: string } | null
  const date = body?.date ?? new Date().toISOString().split('T')[0]
  const db   = svc()

  const { data: diary, error: fetchErr } = await db
    .from('school_daily_diary')
    .select('id, content, sealed')
    .eq('school_id', auth.schoolId!)
    .eq('diary_date', date)
    .single()

  if (fetchErr || !diary) {
    return NextResponse.json({ error: 'Diary entry not found — create it first.' }, { status: 404 })
  }

  const d = diary as { id: string; content: Record<string, unknown>; sealed: boolean }

  if (d.sealed) {
    return NextResponse.json({ error: 'Already sealed' }, { status: 409 })
  }

  const sealedAt = new Date().toISOString()

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(d.content) + sealedAt + auth.userId)
    .digest('hex')

  // Generate court-ready PDF via edge function (failure non-blocking)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  let pdfUrl: string | null = null
  try {
    const edgeRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        docType: 'daily_diary',
        data: { date, content: d.content, sealedAt, sealedBy: auth.userId, documentHash: hash },
      }),
    })
    if (edgeRes.ok) {
      const edgeJson = await edgeRes.json() as { url?: string }
      pdfUrl = edgeJson.url ?? null
    }
  } catch { /* pdf is non-blocking */ }

  const { error: updateErr } = await db
    .from('school_daily_diary')
    .update({ sealed: true, sealed_at: sealedAt, sealed_by: auth.userId, document_hash: hash, pdf_url: pdfUrl })
    .eq('id', d.id)
    .eq('school_id', auth.schoolId!)

  if (updateErr) {
    console.error('[diary/seal] update error:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Notify all staff
  await db.from('alerts').insert({
    school_id: auth.schoolId,
    type:      'diary_sealed',
    severity:  'low',
    title:     `Principal has sealed today's school diary (${date})`,
    detail:    { date, document_hash: hash },
  }).then(() => {}, () => {})

  return NextResponse.json({ hash, pdfUrl, sealedAt })
}
