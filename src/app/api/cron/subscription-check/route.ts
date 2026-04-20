/**
 * /api/cron/subscription-check
 * Runs at midnight UTC daily (Vercel Cron).
 * - Schools within grace period → status='grace_period', WhatsApp principal + super admin
 * - Grace period over          → status='frozen', notify both
 * - Parent-facing messages when frozen: neutral "maintenance" language (never reveals payment issue)
 */

import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { sendWhatsApp } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN_PHONE = process.env.SUPER_ADMIN_PHONE ?? ''

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminSupabaseClient()
  const now = new Date()

  const { data: subs } = await db
    .from('school_subscriptions')
    .select('*, schools(id, name)')
    .in('status', ['active', 'grace_period'])
    .lt('expiry_date', now.toISOString())

  const results: string[] = []

  for (const sub of subs ?? []) {
    const school   = sub.schools as unknown as { id: string; name: string }
    const expiry   = new Date(sub.expiry_date)
    const msElapsed = now.getTime() - expiry.getTime()
    const daysElapsed = Math.floor(msElapsed / 86400000)
    const graceDays   = sub.grace_period_days ?? 5
    const daysLeft    = graceDays - daysElapsed

    // Get principal phone
    const { data: principal } = await db
      .from('staff_records')
      .select('phone_number, full_name')
      .eq('school_id', school.id)
      .eq('sub_role', 'principal')
      .single()

    if (daysElapsed <= graceDays) {
      // Within grace period
      if (sub.status !== 'grace_period') {
        await db.from('school_subscriptions')
          .update({ status: 'grace_period' })
          .eq('school_id', school.id)

        await db.from('subscription_events').insert({
          school_id:  school.id,
          event_type: 'grace_period_started',
          details:    { days_left: daysLeft, expired_on: sub.expiry_date },
        })
      }

      // WhatsApp principal
      if (principal?.phone_number) {
        sendWhatsApp(principal.phone_number,
          `⚠️ *${school.name} Subscription Alert*\n\nYour Sychar subscription expired on ${expiry.toDateString()}. You have *${daysLeft} day${daysLeft !== 1 ? 's' : ''}* remaining before the portal is suspended.\n\nPlease renew to continue uninterrupted access. Contact Sychar support immediately.`
        ).then(() => {}, () => {})
      }

      // WhatsApp super admin
      if (SUPER_ADMIN_PHONE) {
        sendWhatsApp(SUPER_ADMIN_PHONE,
          `📊 Grace Period: *${school.name}*\nExpired: ${expiry.toDateString()}\nDays elapsed: ${daysElapsed}/${graceDays}\nPrincipal: ${principal?.full_name ?? 'Unknown'}\nPhone: ${principal?.phone_number ?? 'N/A'}`
        ).then(() => {}, () => {})
      }

      results.push(`grace_period: ${school.name} (${daysLeft}d left)`)

    } else {
      // Grace period over → freeze
      if (sub.status !== 'frozen') {
        await db.from('school_subscriptions')
          .update({ status: 'frozen' })
          .eq('school_id', school.id)

        await db.from('subscription_events').insert({
          school_id:  school.id,
          event_type: 'frozen',
          details:    { reason: 'subscription_expired', days_overdue: daysElapsed },
        })

        // WhatsApp principal (direct)
        if (principal?.phone_number) {
          sendWhatsApp(principal.phone_number,
            `🔴 *${school.name} Portal Suspended*\n\nYour Sychar subscription has expired and the grace period has passed. The portal is now suspended.\n\n*Your school data is safe and intact.* Please contact Sychar support immediately to restore access. Your teachers and parents will see a maintenance message.`
          ).then(() => {}, () => {})
        }

        // WhatsApp super admin
        if (SUPER_ADMIN_PHONE) {
          sendWhatsApp(SUPER_ADMIN_PHONE,
            `🔴 FROZEN: *${school.name}*\nExpired: ${expiry.toDateString()} (${daysElapsed} days overdue)\nPrincipal: ${principal?.full_name ?? 'Unknown'} ${principal?.phone_number ?? ''}\nAction: Approve payment to unfreeze`
          ).then(() => {}, () => {})
        }

        results.push(`frozen: ${school.name}`)
      }
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
