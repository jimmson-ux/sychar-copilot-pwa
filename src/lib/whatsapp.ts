// WhatsApp Business API (Meta Cloud) — send utilities
// Required env vars:
//   WHATSAPP_TOKEN           – permanent system user token
//   WHATSAPP_PHONE_NUMBER_ID – the WhatsApp Business phone number ID
//   WHATSAPP_APP_SECRET      – used to verify incoming webhook signatures
//   WHATSAPP_VERIFY_TOKEN    – random string set in Meta webhook config

import crypto from 'crypto'

const GRAPH_BASE = 'https://graph.facebook.com/v18.0'

// ── Send a plain-text message ─────────────────────────────────────────────────

export async function sendWhatsApp(to: string, body: string): Promise<boolean> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const token   = process.env.WHATSAPP_TOKEN
  if (!phoneId || !token) {
    console.warn('[WhatsApp] Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN')
    return false
  }

  try {
    const res = await fetch(`${GRAPH_BASE}/${phoneId}/messages`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[WhatsApp] Send failed to ${to}: ${res.status} ${err}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[WhatsApp] Network error to ${to}:`, e)
    return false
  }
}

// ── Bulk send with rate-limit batching ────────────────────────────────────────
// Meta limit: ~250 msgs/s for Tier 1, 1000/s for Tier 3.
// Default: 50/batch, 200ms delay → safe for all tiers.

export async function sendBulkWhatsApp(
  recipients: string[],
  message: string,
  opts: { batchSize?: number; delayMs?: number } = {}
): Promise<{ sent: number; failed: number }> {
  const batchSize = opts.batchSize ?? 50
  const delayMs   = opts.delayMs   ?? 200

  let sent = 0; let failed = 0
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize)
    const results = await Promise.allSettled(batch.map(r => sendWhatsApp(r, message)))
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) sent++
      else failed++
    }
    if (i + batchSize < recipients.length && delayMs > 0) {
      await new Promise(res => setTimeout(res, delayMs))
    }
  }
  return { sent, failed }
}

// ── Verify Meta webhook HMAC signature ────────────────────────────────────────
// Called before processing any incoming webhook POST.

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const secret = process.env.WHATSAPP_APP_SECRET
  if (!secret) {
    console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature check')
    return true  // allow in dev; set the secret in production
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// ── Parse incoming webhook payload ───────────────────────────────────────────

export interface WhatsAppMessage {
  from:      string   // E.164 phone number, e.g. "254712345678"
  messageId: string
  text:      string
  timestamp: number
}

export function parseIncomingMessage(body: unknown): WhatsAppMessage | null {
  try {
    const b = body as Record<string, unknown>
    const entry   = (b.entry as unknown[])?.[0] as Record<string, unknown>
    const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>
    const value   = changes?.value as Record<string, unknown>
    const msg     = (value?.messages as unknown[])?.[0] as Record<string, unknown>
    if (!msg || msg.type !== 'text') return null
    const text = (msg.text as Record<string, string>)?.body?.trim()
    if (!text) return null
    return {
      from:      String(msg.from),
      messageId: String(msg.id),
      text,
      timestamp: Number(msg.timestamp),
    }
  } catch {
    return null
  }
}
