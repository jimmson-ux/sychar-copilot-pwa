// GET /api/cron/emergency-sms-fallback
// Runs every 15 minutes via Vercel Cron.
// Finds broadcasts sent 30–75 min ago with unconfirmed parents → sends SMS fallback.
// After 60 min: inserts an alert for the principal with the manual call list.
// Idempotent: sms_fallback_sent_at prevents duplicate SMS.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendBulkSMS } from '@/lib/sms'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  // Protect with a shared cron secret
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db  = svc()
  const now = new Date()

  // Window: broadcasts sent 30–75 min ago that haven't had SMS fallback yet
  const thirtyMinsAgo   = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const seventyFiveMinsAgo = new Date(now.getTime() - 75 * 60 * 1000).toISOString()

  const { data: broadcasts } = await db
    .from('emergency_broadcasts')
    .select('id, school_id, type, message, sent_count')
    .gte('sent_at', seventyFiveMinsAgo)
    .lte('sent_at', thirtyMinsAgo)
    .is('sms_fallback_sent_at', null)
    .not('sent_at', 'is', null)

  if (!broadcasts || broadcasts.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let totalSMSSent = 0

  for (const broadcast of broadcasts) {
    const b = broadcast as { id: string; school_id: string; type: string; message: string; sent_count: number }

    // Get confirmed phones
    const { data: confirmed } = await db
      .from('emergency_confirmations')
      .select('parent_phone')
      .eq('broadcast_id', b.id)

    const confirmedPhones = new Set(
      ((confirmed ?? []) as { parent_phone: string }[]).map(c => c.parent_phone)
    )

    // Get all recipients
    const { data: sessions } = await db
      .from('parent_bot_sessions')
      .select('phone')
      .eq('school_id', b.school_id)
      .eq('state', 'active')
      .eq('consent_given', true)

    const unconfirmedPhones = ((sessions ?? []) as { phone: string }[])
      .map(s => s.phone)
      .filter(p => !confirmedPhones.has(p))

    if (unconfirmedPhones.length > 0) {
      const smsText = buildSmsText(b.type, b.message)
      const { sent } = await sendBulkSMS(unconfirmedPhones, smsText)
      totalSMSSent += sent
    }

    // Mark SMS fallback sent
    await db.from('emergency_broadcasts')
      .update({ sms_fallback_sent_at: now.toISOString() })
      .eq('id', b.id)

    // After 60 min: create a principal alert for manual calls
    const { data: broadcastRow } = await db
      .from('emergency_broadcasts')
      .select('sent_at')
      .eq('id', b.id)
      .single()

    const sentAt   = (broadcastRow as { sent_at: string } | null)?.sent_at
    const minsSent = sentAt ? (now.getTime() - new Date(sentAt).getTime()) / 60000 : 0

    if (minsSent >= 60 && unconfirmedPhones.length > 0) {
      await db.from('alerts').insert({
        school_id: b.school_id,
        type:      'emergency_unconfirmed',
        severity:  'high',
        title:     `Emergency broadcast: ${unconfirmedPhones.length} parent(s) unconfirmed after 60 min`,
        detail:    {
          broadcast_id: b.id,
          unconfirmed_count: unconfirmedPhones.length,
          action: 'manual_calls_required',
        },
      }).then(() => {}, () => {})
    }
  }

  return NextResponse.json({
    ok:        true,
    processed: broadcasts.length,
    sms_sent:  totalSMSSent,
  })
}

function buildSmsText(type: string, message: string): string {
  const prefix: Record<string, string> = {
    school_closure:      'SCHOOL CLOSURE',
    lockdown:            'SECURITY ALERT',
    natural_disaster:    'DISASTER ALERT',
    health_emergency:    'HEALTH EMERGENCY',
    infrastructure:      'SCHOOL NOTICE',
    government_directive:'GOVT DIRECTIVE',
    custom:              'SCHOOL NOTICE',
  }
  const p = prefix[type] ?? 'SCHOOL NOTICE'
  // SMS: 160 chars. Truncate message to fit.
  const maxMsg = 140 - p.length
  const truncated = message.length > maxMsg ? message.slice(0, maxMsg - 3) + '...' : message
  return `${p}: ${truncated}`
}
