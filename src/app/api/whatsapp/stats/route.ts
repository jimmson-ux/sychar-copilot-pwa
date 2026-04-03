// GET /api/whatsapp/stats — bot analytics for the dashboard

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getSb()

  // Last 30 days
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [logRes, settingsRes] = await Promise.all([
    sb
      .from('sms_log')
      .select('id, direction, intent, phone, message, created_at')
      .eq('school_id', auth.schoolId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200),
    sb
      .from('school_settings')
      .select('whatsapp_bot_enabled, voice_bot_enabled')
      .eq('school_id', auth.schoolId)
      .single(),
  ])

  const logs = logRes.data ?? []
  const settings = settingsRes.data

  // Aggregate stats
  const inbound  = logs.filter(l => l.direction === 'inbound')
  const outbound = logs.filter(l => l.direction === 'outbound')

  const intentCounts: Record<string, number> = {}
  for (const l of inbound) {
    if (l.intent) intentCounts[l.intent] = (intentCounts[l.intent] ?? 0) + 1
  }

  // Unique parents who messaged
  const uniquePhones = new Set(inbound.map(l => l.phone)).size

  // Recent conversations (last 20 inbound with replies)
  const recent = inbound.slice(0, 20).map(l => ({
    id:        l.id,
    phone:     l.phone.slice(-4).padStart(l.phone.length, '*'),
    intent:    l.intent ?? 'unknown',
    message:   l.message?.slice(0, 80) ?? '',
    createdAt: l.created_at,
  }))

  return NextResponse.json({
    botEnabled:        settings?.whatsapp_bot_enabled ?? true,
    voiceBotEnabled:   settings?.voice_bot_enabled ?? false,
    totalInbound:      inbound.length,
    totalOutbound:     outbound.length,
    uniqueParents:     uniquePhones,
    intentBreakdown:   intentCounts,
    recentConversations: recent,
  })
}
