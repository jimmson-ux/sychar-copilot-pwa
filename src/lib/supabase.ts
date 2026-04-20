import { createBrowserClient } from '@supabase/ssr'

/**
 * createBrowserClient from @supabase/ssr stores the auth session in cookies
 * by default. The middleware reads those same cookies to validate the session.
 * This is why we do NOT override the storage — if we use localStorage the
 * middleware cannot see the token and redirects every /dashboard request back
 * to /login, causing the "Signing In..." hang.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Singleton for client-side use
let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (!_client) _client = createClient()
  return _client
}

export default getSupabaseClient
