/**
 * cacheUtils.ts
 * Read-through cache backed by the analytics_cache table.
 * Uses the service-role client so it bypasses RLS —
 * callers must already have validated school_id from requireAuth().
 */

import { createAdminSupabaseClient } from '@/lib/supabase-server'

/** How old a cache entry must be (in minutes) before it is considered stale */
const DEFAULT_TTL_MINUTES = 30

export async function getCachedOrCompute<T>(
  schoolId: string,
  cacheKey: string,
  computeFn: () => Promise<T>,
  ttlMinutes: number = DEFAULT_TTL_MINUTES,
): Promise<T> {
  const admin = createAdminSupabaseClient()

  // ── 1. Try cache ───────────────────────────────────────────
  const { data: cached } = await admin
    .from('analytics_cache')
    .select('payload, computed_at')
    .eq('school_id', schoolId)
    .eq('cache_key', cacheKey)
    .single()

  if (cached) {
    const ageMs = Date.now() - new Date(cached.computed_at).getTime()
    const ageMins = ageMs / 60_000
    if (ageMins < ttlMinutes) {
      return cached.payload as T
    }
  }

  // ── 2. Cache miss or stale — compute ───────────────────────
  const result = await computeFn()

  // ── 3. Upsert into analytics_cache ─────────────────────────
  await admin
    .from('analytics_cache')
    .upsert(
      {
        school_id:   schoolId,
        cache_key:   cacheKey,
        payload:     result as object,
        computed_at: new Date().toISOString(),
      },
      { onConflict: 'school_id,cache_key' },
    )

  return result
}

/** Force-invalidate one or more cache keys for a school */
export async function bustCache(schoolId: string, ...keys: string[]): Promise<void> {
  const admin = createAdminSupabaseClient()
  await admin
    .from('analytics_cache')
    .delete()
    .eq('school_id', schoolId)
    .in('cache_key', keys)
}
