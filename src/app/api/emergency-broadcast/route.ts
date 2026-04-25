// POST /api/emergency-broadcast — principal only — create and send emergency broadcast
// GET  /api/emergency-broadcast — principal/deputy — list recent broadcasts
//
// Sends WhatsApp blast to ALL registered parents in school within 60 seconds.
// Message appended with "Reply YES to confirm receipt."
// Confirmation tracking handled via webhook → emergency_confirmations table.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendBulkWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const BROADCAST_TYPES = [
  'school_closure', 'lockdown', 'natural_disaster',
  'health_emergency', 'infrastructure', 'government_directive', 'custom',
] as const

// ── GET — list recent broadcasts ──────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'deputy'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: principal/deputy only' }, { status: 403 })
  }

  const db = svc()
  const { data, error } = await db
    .from('emergency_broadcasts')
    .select(`
      id, type, message, total_recipients, sent_count,
      sent_at, sms_fallback_sent_at, created_at,
      confirmations:emergency_confirmations(count)
    `)
    .eq('school_id', auth.schoolId!)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const broadcasts = (data ?? []).map(b => {
    const d = b as {
      id: string; type: string; message: string;
      total_recipients: number; sent_count: number;
      sent_at: string | null; sms_fallback_sent_at: string | null; created_at: string;
      confirmations: Array<{ count: number }>;
    }
    const confirmed = d.confirmations?.[0]?.count ?? 0
    return {
      id:              d.id,
      type:            d.type,
      message:         d.message,
      total_recipients: d.total_recipients,
      sent_count:      d.sent_count,
      confirmed,
      confirmation_pct: d.sent_count > 0 ? Math.round((confirmed / d.sent_count) * 100) : 0,
      sent_at:         d.sent_at,
      sms_fallback_sent_at: d.sms_fallback_sent_at,
      created_at:      d.created_at,
    }
  })

  return NextResponse.json({ broadcasts })
}

// ── POST — create and send broadcast ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    type:    string
    message: string
    test_phone?: string  // if set, send only to this number (dry run)
  }

  if (!body.type || !body.message) {
    return NextResponse.json({ error: 'type and message required' }, { status: 400 })
  }
  if (!(BROADCAST_TYPES as readonly string[]).includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${BROADCAST_TYPES.join(', ')}` }, { status: 400 })
  }
  if (body.message.length > 1000) {
    return NextResponse.json({ error: 'message too long (max 1000 chars)' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId!)
    .eq('school_id', auth.schoolId!)
    .single()

  // TEST MODE: send only to test_phone
  if (body.test_phone) {
    const testMsg = formatBroadcastMessage(body.type, body.message, true)
    const ok = await (await import('@/lib/whatsapp')).sendWhatsApp(body.test_phone, testMsg)
    return NextResponse.json({ ok, test: true, recipient: body.test_phone })
  }

  // Fetch all registered parent phones for this school
  const { data: sessions } = await db
    .from('parent_bot_sessions')
    .select('phone')
    .eq('school_id', auth.schoolId!)
    .eq('consent_given', true)
    .eq('state', 'active')

  const phones = (sessions ?? []).map((s: { phone: string }) => s.phone)

  if (phones.length === 0) {
    return NextResponse.json({ error: 'No registered parents found for this school' }, { status: 404 })
  }

  // Create broadcast record
  const { data: broadcast, error: createErr } = await db
    .from('emergency_broadcasts')
    .insert({
      school_id:        auth.schoolId,
      type:             body.type,
      message:          body.message,
      total_recipients: phones.length,
      created_by:       (staff as { id: string } | null)?.id ?? null,
    })
    .select('id')
    .single()

  if (createErr || !broadcast) {
    return NextResponse.json({ error: createErr?.message ?? 'DB error' }, { status: 500 })
  }

  const broadcastId = (broadcast as { id: string }).id
  const fullMessage = formatBroadcastMessage(body.type, body.message, false)

  // Send in batches — 50/batch, 200ms delay → handles 500 parents in ~2 seconds
  const { sent, failed } = await sendBulkWhatsApp(phones, fullMessage, { batchSize: 50, delayMs: 200 })

  // Update sent count and timestamp
  await db.from('emergency_broadcasts').update({
    sent_count: sent,
    sent_at:    new Date().toISOString(),
  }).eq('id', broadcastId)

  return NextResponse.json({
    ok:               true,
    broadcast_id:     broadcastId,
    total_recipients: phones.length,
    sent,
    failed,
    message_preview:  fullMessage.slice(0, 120) + '...',
  })
}

// ── Format broadcast message with type header + confirmation footer ───────────

function formatBroadcastMessage(type: string, message: string, isTest: boolean): string {
  const headers: Record<string, string> = {
    school_closure:      '🔴 SCHOOL CLOSURE NOTICE',
    lockdown:            '🚨 SECURITY ALERT — LOCKDOWN',
    natural_disaster:    '⛈️ NATURAL DISASTER ALERT',
    health_emergency:    '🏥 HEALTH EMERGENCY NOTICE',
    infrastructure:      '🔧 INFRASTRUCTURE NOTICE',
    government_directive:'📋 GOVERNMENT DIRECTIVE',
    custom:              '📢 IMPORTANT NOTICE',
  }
  const header = headers[type] ?? '📢 IMPORTANT NOTICE'
  const testBanner = isTest ? '\n\n[TEST MESSAGE — NOT A REAL BROADCAST]\n' : ''
  return `*${header}*${testBanner}\n\n${message}\n\n_Reply *YES* to confirm you received this message._`
}
