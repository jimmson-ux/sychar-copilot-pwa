import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { sendWhatsApp as sendWhatsAppMessage } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'

/**
 * POST /api/parent/auth/request-otp
 * Body: { _ctx: string }   — base64 context from /lookup
 *
 * Step 2 of parent login:
 *   - Decodes _ctx (school_id, student_id)
 *   - Generates a 6-digit OTP, stores hashed in parent_sessions (10 min TTL)
 *   - Delivers OTP via WhatsApp to parent_phone
 *   - Rate-limited: max 3 OTP requests per phone per 10 minutes
 *
 * Response: { sent: true }
 */

const OTP_TTL_MS    = 10 * 60 * 1000   // 10 minutes
const RATE_LIMIT    = 3                  // max OTPs per window
const RATE_WINDOW   = 10 * 60 * 1000    // window size

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { _ctx } = body as { _ctx?: string }

  if (!_ctx) {
    return NextResponse.json({ error: 'Missing context token' }, { status: 400 })
  }

  let ctx: { school_id: string; student_id: string }
  try {
    ctx = JSON.parse(Buffer.from(_ctx, 'base64').toString('utf8'))
  } catch {
    return NextResponse.json({ error: 'Invalid context token' }, { status: 400 })
  }

  if (!ctx.school_id || !ctx.student_id) {
    return NextResponse.json({ error: 'Malformed context token' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Fetch parent phone and all linked students for this parent
  const { data: student } = await svc
    .from('students')
    .select('parent_phone, school_id')
    .eq('id', ctx.student_id)
    .eq('school_id', ctx.school_id)
    .single()

  if (!student?.parent_phone) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  }

  const parentPhone = student.parent_phone as string

  // Rate limit: count recent OTP requests for this phone
  const windowStart = new Date(Date.now() - RATE_WINDOW).toISOString()
  const { count } = await svc
    .from('parent_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('parent_phone', parentPhone)
    .eq('school_id', ctx.school_id)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many OTP requests. Please wait 10 minutes.' },
      { status: 429 },
    )
  }

  // Fetch ALL student IDs linked to this parent phone in this school
  const { data: siblings } = await svc
    .from('students')
    .select('id')
    .eq('school_id', ctx.school_id)
    .or(`parent_phone.eq.${parentPhone},parent2_phone.eq.${parentPhone}`)

  const studentIds = (siblings ?? []).map((s: { id: string }) => s.id)

  const otp       = generateOTP()
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()
  const ua        = (req.headers.get('user-agent') ?? '').slice(0, 120)

  // Upsert session (deactivate old ones, create fresh)
  await svc
    .from('parent_sessions')
    .update({ is_active: false })
    .eq('parent_phone', parentPhone)
    .eq('school_id', ctx.school_id)
    .eq('is_active', true)

  await svc.from('parent_sessions').insert({
    school_id:     ctx.school_id,
    parent_phone:  parentPhone,
    student_ids:   studentIds,
    otp_code:      otp,
    otp_expires_at: expiresAt,
    device_hint:   ua,
    is_active:     true,
  })

  // Deliver OTP via WhatsApp
  await sendWhatsAppMessage(
    parentPhone,
    `Your Sychar CoPilot verification code is: *${otp}*\n\nExpires in 10 minutes. Do not share this code.`,
  )

  return NextResponse.json({ sent: true })
}
