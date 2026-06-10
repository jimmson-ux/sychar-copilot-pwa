// Shared cron authorization. Accepts the secret via any of the ways our schedulers send it:
//   • Vercel Cron     → `Authorization: Bearer <CRON_SECRET>`
//   • QStash / manual → `x-cron-secret: <CRON_SECRET>`
//   • query fallback  → `?secret=` or `?key=`
// Routes that only checked one of these were silently 401-ing under the other caller.
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // no secret configured → deny (fail closed)

  const auth = req.headers.get('authorization') ?? ''
  if (auth === `Bearer ${secret}`) return true

  if (req.headers.get('x-cron-secret') === secret) return true

  try {
    const sp = new URL(req.url).searchParams
    if (sp.get('secret') === secret || sp.get('key') === secret) return true
  } catch { /* non-absolute URL — ignore */ }

  return false
}
