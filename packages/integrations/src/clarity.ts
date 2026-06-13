// Microsoft Clarity (session replay + heatmaps) — per-school project, config-injected.
// initClarity() once with the school's project id; identifyClarity by role for filtered
// recordings. Never pass PII as custom tags.

export interface ClarityConfig { projectId: string }

// deno-lint-ignore no-explicit-any
let clarity: any = null

export async function initClarity(cfg: ClarityConfig): Promise<void> {
  if (!cfg?.projectId || clarity) return
  try {
    const mod = await import('@microsoft/clarity')
    clarity = mod.default ?? mod
    clarity.init(cfg.projectId)
  } catch {
    /* @microsoft/clarity not installed — optional */
  }
}

/** Filter recordings by role (no PII). */
export function identifyClarity(userId: string, role?: string): void {
  try { clarity?.identify(userId, undefined, undefined, role) } catch { /* noop */ }
}

export function claritySetTag(key: string, value: string): void {
  try { clarity?.setTag(key, value) } catch { /* noop */ }
}
