type RateLimitRecord = { count: number; resetAt: number }
const store = new Map<string, RateLimitRecord>()

setInterval(() => {
  const now = Date.now()
  for (const [key, record] of store.entries()) {
    if (now > record.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export function rateLimit(
  identifier: string,
  maxRequests = 30,
  windowMs = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const record = store.get(identifier)

  if (!record || now > record.resetAt) {
    const newRecord = { count: 1, resetAt: now + windowMs }
    store.set(identifier, newRecord)
    return { allowed: true, remaining: maxRequests - 1, resetAt: newRecord.resetAt }
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt }
  }

  record.count++
  return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt }
}

export const LIMITS = {
  AI_CHAT:      { max: 20,  window: 60_000 },
  OCR_SCANNER:  { max: 10,  window: 60_000 },
  AUTH:         { max: 5,   window: 300_000 },
  API_GENERAL:  { max: 60,  window: 60_000 },
  SMS:          { max: 5,   window: 3_600_000 },
  WHATSAPP:     { max: 10,  window: 60_000 },
  FEE_RECORD:   { max: 30,  window: 60_000 },
  INVIGILATION: { max: 15,  window: 60_000 },
  DOWNLOAD_PDF: { max: 10,  window: 60_000 },
}
