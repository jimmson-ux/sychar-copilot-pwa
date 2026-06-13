// Upstash Redis (server-side cache / rate-limit) — per-school database, config-injected.
// Use on the server only (each school's own REST url + token). Returns null if the SDK
// isn't installed or config is missing, so callers degrade gracefully.

export interface RedisConfig { url: string; token: string }

// deno-lint-ignore no-explicit-any
export async function createRedis(cfg: RedisConfig): Promise<any | null> {
  if (!cfg?.url || !cfg?.token) return null
  try {
    const { Redis } = await import('@upstash/redis')
    return new Redis({ url: cfg.url, token: cfg.token })
  } catch {
    return null
  }
}
