// Africa's Talking SMS — fallback when WhatsApp delivery fails or for emergency broadcasts
// Required env vars:
//   AT_API_KEY      – Africa's Talking API key
//   AT_USERNAME     – account username (use 'sandbox' for testing)
//   AT_SENDER_ID    – shortcode or alphanumeric sender (optional; AT picks default if omitted)

const AT_BASE = 'https://api.africastalking.com/version1/messaging'

export async function sendSMS(to: string, message: string): Promise<boolean> {
  const apiKey    = process.env.AT_API_KEY
  const username  = process.env.AT_USERNAME
  if (!apiKey || !username) {
    console.warn('[SMS] Missing AT_API_KEY or AT_USERNAME')
    return false
  }

  const params = new URLSearchParams({
    username,
    to,
    message,
  })
  if (process.env.AT_SENDER_ID) {
    params.set('from', process.env.AT_SENDER_ID)
  }

  try {
    const res = await fetch(AT_BASE, {
      method:  'POST',
      headers: {
        'ApiKey':       apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept':       'application/json',
      },
      body: params.toString(),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error(`[SMS] Send failed to ${to}: ${res.status} ${err}`)
      return false
    }
    const json = await res.json() as { SMSMessageData?: { Recipients?: Array<{ status: string }> } }
    const recipients = json.SMSMessageData?.Recipients ?? []
    const success = recipients.some(r => r.status === 'Success')
    if (!success) {
      console.warn(`[SMS] AT response non-success for ${to}:`, JSON.stringify(json))
    }
    return success
  } catch (e) {
    console.error(`[SMS] Network error to ${to}:`, e)
    return false
  }
}

// Bulk SMS with small delay to respect AT rate limits
export async function sendBulkSMS(
  recipients: string[],
  message: string,
  opts: { batchSize?: number; delayMs?: number } = {}
): Promise<{ sent: number; failed: number }> {
  const batchSize = opts.batchSize ?? 20
  const delayMs   = opts.delayMs   ?? 500

  let sent = 0; let failed = 0
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize)
    const results = await Promise.allSettled(batch.map(r => sendSMS(r, message)))
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
