// PostHog (product analytics) — per-school project, config-injected.
// Each school PWA calls initPostHog() once with ITS OWN key/host (import.meta.env),
// then identify(userId, {role, school}) after login and track(EVENTS.X, props).
// Privacy: ids/roles only — never names, admission numbers, phones, finance, medical.

import type { SycharEvent } from './events'

export interface PostHogConfig { key: string; host?: string }

// deno-lint-ignore no-explicit-any
let ph: any = null

export async function initPostHog(cfg: PostHogConfig): Promise<void> {
  if (!cfg?.key || ph) return
  try {
    const mod = await import('posthog-js')
    ph = mod.default ?? mod
    ph.init(cfg.key, { api_host: cfg.host ?? 'https://us.i.posthog.com', capture_pageview: true, persistence: 'localStorage' })
  } catch {
    /* posthog-js not installed in this repo — analytics is optional */
  }
}

/** Tie events to a stable user + role + school (no PII). */
export function identify(userId: string, props: { role?: string; school?: string } = {}): void {
  try { ph?.identify(userId, { role: props.role, school: props.school }) } catch { /* noop */ }
}

export function track(event: SycharEvent | string, props: Record<string, string | number | boolean> = {}): void {
  try { ph?.capture(event, props) } catch { /* noop */ }
}

export function resetAnalytics(): void {
  try { ph?.reset() } catch { /* noop */ }
}
