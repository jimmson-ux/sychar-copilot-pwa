// POST /api/parent/auth/otp/send
// Body: { phone }
// Generates a 4-digit OTP, stores in auth_rate_limits, sends via Africa's Talking SMS.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/sms'

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('254')) return '+' + digits
  if (digits.startsWith('0') && digits.length === 10) return '+254' + digits.slice(1)
  if (digits.length === 9) return '+254' + digits
  return '+' + digits
}

const OTP_TTL_MS    = 10 * 60 * 1000  // 10 minutes
const RATE_LIMIT    = 3               // max OTPs per phone per 10-min window
const RATE_WINDOW_MS = 10 * 60 * 1000

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { phone?: string }

  if (!body.phone?.trim()) {
    return NextResponse.json({ error: 'phone required' }, { status: 400 })
  }

  const phone = normalizePhone(body.phone.trim())
  const svc   = createAdminSupabaseClient()

  // Rate limit: max 3 OTPs per phone per 10-minute window
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count } = await svc
    .from('auth_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please wait 10 minutes before trying again.' },
      { status: 429 }
    )
  }

  const otp       = String(Math.floor(1000 + Math.random() * 9000))
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Invalidate previous OTPs for this phone
  await svc
    .from('auth_rate_limits')
    .update({ used: true })
    .eq('phone', phone)
    .eq('used', false)

  await svc.from('auth_rate_limits').insert({
    phone,
    otp_code:   otp,
    expires_at: expiresAt,
    used:       false,
    attempts:   0,
  })

  await sendSMS(phone, `Your Sychar CoPilot code: ${otp}\nExpires in 10 minutes. Do not share.`)

  return NextResponse.json({ sent: true })
}
