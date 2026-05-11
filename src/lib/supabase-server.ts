import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server component — cookies can't be set
          }
        },
      },
    }
  )
}

export function createAdminSupabaseClient() {
  // SCHOOL_SUPABASE_URL overrides NEXT_PUBLIC_SUPABASE_URL so the school data
  // DB (xwgtsldimlrhtgvpnjnd) can be used even when the Vercel project's default
  // Supabase env vars point to a different project.
  const url = process.env.SCHOOL_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key =
    process.env.SCHOOL_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
