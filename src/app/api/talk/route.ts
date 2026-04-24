// POST /api/talk — public endpoint, no auth required
// Rate limited: 3 per hour per IP.
// Inserts into counselling_logs and silently notifies the counsellor.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// In-process rate limiting: IP → timestamps[]
const ipHits    = new Map<string, number[]>()
const RATE_LIMIT  = 3
const RATE_WINDOW = 60 * 60 * 1000 // 1 hour

function checkRateLimit(ip: string): boolean {
  const now  = Date.now()
  const hits = (ipHits.get(ip) ?? []).filter(t => now - t < RATE_WINDOW)
  if (hits.length >= RATE_LIMIT) return false
  ipHits.set(ip, [...hits, now])
  return true
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many submissions. Please wait before trying again.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as {
    code?:        string   // school_short_code
    message:      string
    firstName?:   string
    className?:   string
    isAnonymous?: boolean
  } | null

  if (!body?.message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }

  const msg = body.message.trim()
  if (msg.length < 20) {
    return NextResponse.json({ error: 'Please describe your concern in more detail (minimum 20 characters)' }, { status: 400 })
  }
  if (msg.length > 2000) {
    return NextResponse.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
  }

  const db          = svc()
  const isAnonymous = body.isAnonymous ?? true

  // Resolve school from short_code
  let schoolId: string | null = null
  if (body.code?.trim()) {
    const { data: school } = await db
      .from('schools')
      .select('id')
      .eq('school_short_code', body.code.trim())
      .eq('active', true)
      .single()
    schoolId = (school as { id: string } | null)?.id ?? null
  }

  // Sanitise: strip any HTML tags
  const sanitised = msg.replace(/<[^>]*>/g, '').trim()

  const { data: log, error } = await db
    .from('counselling_logs')
    .insert({
      school_id:    schoolId,
      student_name: isAnonymous ? null : (body.firstName?.trim() || null),
      class_name:   body.className?.trim() || null,
      content:      sanitised,
      is_anonymous: isAnonymous,
      source:       'self_referral_qr',
      status:       'new',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[/api/talk] insert error:', error.message)
    return NextResponse.json({ error: 'Could not submit. Please try again.' }, { status: 500 })
  }

  // Silent push to counsellor only (NOT principal)
  if (schoolId) {
    await db.from('alerts').insert({
      school_id: schoolId,
      type:      'gc_self_referral',
      severity:  'high',
      title:     `New student self-referral${isAnonymous ? ' (anonymous)' : body.firstName ? ` from ${body.firstName}` : ''}${body.className ? ` — ${body.className}` : ''}`,
      detail:    {
        log_id:          (log as { id: string }).id,
        is_anonymous:    isAnonymous,
        content_preview: sanitised.slice(0, 100),
      },
    }).then(() => {}, () => {})
  }

  return NextResponse.json({ success: true })
}
