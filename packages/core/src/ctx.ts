// Shared request context + Supabase typing for framework-agnostic data-access.
//
// Every core data-access function takes (supabase, ctx, input) — the host app
// (Next.js today, TanStack tomorrow, each school PWA) authenticates however it
// likes, then hands core a SupabaseClient + this AuthContext. Core never imports
// next/* or @tanstack/* and never reads cookies or env directly.

import type { SupabaseClient } from '@supabase/supabase-js'

export type { SupabaseClient }

/** The authenticated caller, resolved by the host app's auth layer. */
export interface AuthContext {
  userId: string
  schoolId: string
  subRole: string
}

/**
 * Optional side-effect hook so core stays pure: the host injects how a push
 * notification is delivered (Next route → send-push fetch; TanStack → its own).
 */
export type Notify = (args: {
  audience: 'all' | 'role' | 'staff' | 'department'
  value?: string | string[]
  payload: Record<string, unknown>
}) => void | Promise<void>
