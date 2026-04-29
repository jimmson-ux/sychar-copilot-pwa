/**
 * push.ts — VAPID Web Push delivery
 *
 * Requires env vars:
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key
 *   VAPID_EMAIL        — contact email for VAPID (e.g. mailto:admin@school.ke)
 *
 * Generate keys:  node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
 */

import webpush from 'web-push'

let _configured = false

function configure() {
  if (_configured) return
  const pub   = process.env.VAPID_PUBLIC_KEY
  const priv  = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL ?? 'mailto:admin@sychar.co.ke'
  if (!pub || !priv) return  // keys not set — push silently disabled
  webpush.setVapidDetails(email, pub, priv)
  _configured = true
}

export interface PushPayload {
  title:    string
  body:     string
  tag?:     string
  type?:    string
  url?:     string
  token?:   string
  actions?: { action: string; title: string }[]
}

export interface PushSubscriptionObject {
  endpoint: string
  keys: {
    p256dh: string
    auth:   string
  }
}

export async function sendPush(
  subscription: PushSubscriptionObject,
  payload: PushPayload,
): Promise<{ ok: boolean; gone?: boolean }> {
  configure()
  if (!_configured) return { ok: false }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 600 },
    )
    return { ok: true }
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode
    // 404 / 410 = subscription expired — caller should delete it
    if (status === 404 || status === 410) return { ok: false, gone: true }
    console.error('[push] sendNotification failed:', err)
    return { ok: false }
  }
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? ''
}
