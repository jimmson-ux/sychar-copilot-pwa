// GET  /api/whatsapp/webhook — Meta webhook verification challenge
// POST /api/whatsapp/webhook — Incoming messages from WhatsApp Cloud API
//
// SECURITY:
//   - Every POST verified via X-Hub-Signature-256 (HMAC-SHA256 of raw body)
//   - school_id is NEVER read from message content — always from pinned session
//   - Webhook always returns 200 quickly; processing runs after response

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, parseIncomingMessage } from '@/lib/whatsapp'
import { handleIncomingMessage } from '@/lib/bot/handlers'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── GET — Meta webhook verification ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  const token     = req.nextUrl.searchParams.get('hub.verify_token')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? '', { status: 200 })
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST — Incoming message ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Must read raw body before parsing, for signature verification
  const rawBody  = await req.text()
  const signature = req.headers.get('x-hub-signature-256')

  // Verify signature — reject tampered payloads
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[WhatsApp webhook] Invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Always return 200 immediately — Meta retries if we don't respond fast
  // Process the message asynchronously
  const msg = parseIncomingMessage(body)

  if (msg) {
    // Fire and forget — do not await
    processMessage(msg.from, msg.text).catch(err =>
      console.error('[WhatsApp webhook] Processing error:', err)
    )
  }

  return NextResponse.json({ status: 'ok' })
}

// ── Async message processor ───────────────────────────────────────────────────

async function processMessage(phone: string, text: string): Promise<void> {
  const db = svc()

  try {
    // CRITICAL: school_id is read from pinned session inside handleIncomingMessage
    // It is NEVER derived from message text
    const response = await handleIncomingMessage(phone, text, db)
    if (response) {
      await sendWhatsApp(phone, response)
    }
  } catch (err) {
    console.error(`[WhatsApp] Handler error for ${phone}:`, err)
    // Send a generic error reply — don't expose internal errors
    await sendWhatsApp(phone, `Sorry, an error occurred. Please try again or reply *HELP* for commands.`)
  }
}
