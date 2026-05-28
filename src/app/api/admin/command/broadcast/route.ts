import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

async function getAuthedDb(req: NextRequest) {
  const db    = createAdminSupabaseClient()
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '')
  if (token) {
    const { data: { user } } = await db.auth.getUser(token)
    if (user) return { db, authed: true }
  }
  const sc = await createServerSupabaseClient()
  const { data: { user } } = await sc.auth.getUser()
  return { db, authed: !!user }
}

export async function POST(req: NextRequest) {
  const { db, authed } = await getAuthedDb(req)
  if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as {
    school_id:  string
    audience:   string
    title:      string
    body:       string
    send_push:  boolean
    send_sms:   boolean
  } | null

  if (!body?.school_id || !body.title || !body.body) {
    return NextResponse.json({ error: 'school_id, title, body required' }, { status: 400 })
  }

  const { school_id, audience, title, send_push, send_sms } = body
  const messageBody = body.body

  let pushSent = 0, pushFailed = 0, smsSent = 0, smsFailed = 0

  // Fetch slug for the notification URL
  const { data: tenant } = await db
    .from('tenant_configs')
    .select('slug')
    .eq('school_id', school_id)
    .maybeSingle()
  const slug = (tenant as any)?.slug ?? null
  const url  = slug ? `https://${slug}.sychar.co.ke` : 'https://app.sychar.co.ke'

  // ── Push notification via send-push edge function ────────────
  if (send_push) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && serviceKey) {
      try {
        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            audience: audience === 'all' ? 'all' : 'role',
            value:    audience === 'all' ? undefined : audience,
            school_id,
            payload:  { title, body: messageBody, url },
          }),
        })
        if (pushRes.ok) {
          const pushData = await pushRes.json() as { sent?: number; failed?: number }
          pushSent   = pushData.sent   ?? 0
          pushFailed = pushData.failed ?? 0
        } else {
          pushFailed = 1
        }
      } catch {
        pushFailed = 1
      }
    }
  }

  // ── SMS via Africa's Talking ──────────────────────────────────
  if (send_sms) {
    let staffQuery = db
      .from('staff_records')
      .select('phone_number')
      .eq('school_id', school_id)
      .not('phone_number', 'is', null)

    if (audience !== 'all') {
      staffQuery = staffQuery.eq('sub_role', audience) as typeof staffQuery
    }

    const { data: staffRows } = await staffQuery
    const phones = (staffRows ?? [])
      .map((s: any) => s.phone_number as string)
      .filter(Boolean)

    const smsText = `[${title}]\n${messageBody}`
    const results = await Promise.allSettled(phones.map(p => sendSMS(p, smsText)))
    smsSent   = results.filter(r => r.status === 'fulfilled' && r.value).length
    smsFailed = results.length - smsSent
  }

  return NextResponse.json({ push_sent: pushSent, push_failed: pushFailed, sms_sent: smsSent, sms_failed: smsFailed })
}
