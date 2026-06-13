// QStash (durable scheduled/async messaging) — per-school, config-injected.
// Server-side only. Use to schedule per-school jobs (backups, reminders) on the
// school's OWN QStash token. Returns null if SDK/token missing.

export interface QStashConfig { token: string }

// deno-lint-ignore no-explicit-any
export async function createQStash(cfg: QStashConfig): Promise<any | null> {
  if (!cfg?.token) return null
  try {
    const { Client } = await import('@upstash/qstash')
    return new Client({ token: cfg.token })
  } catch {
    return null
  }
}
