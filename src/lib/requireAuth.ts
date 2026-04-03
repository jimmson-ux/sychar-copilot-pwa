// src/lib/requireAuth.ts
// Server-side authentication guard for Next.js API route handlers.
//
// Usage:
//   const auth = await requireAuth()
//   if (auth.unauthorized) return auth.unauthorized
//   // auth.userId, auth.schoolId, auth.subRole are now verified

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export interface AuthOk {
  userId: string
  schoolId: string
  subRole: string
  unauthorized: null
}

export interface AuthFail {
  userId: null
  schoolId: null
  subRole: null
  unauthorized: NextResponse
}

export async function requireAuth(): Promise<AuthOk | AuthFail> {
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Guard: env vars must be present at runtime (they're defined in Vercel dashboard)
  if (!supabaseUrl || !supabaseAnon) {
    return {
      userId: null, schoolId: null, subRole: null,
      unauthorized: NextResponse.json({ error: 'Server misconfigured — env vars missing' }, { status: 503 }),
    }
  }

  const cookieStore = await cookies()

  // Verify the session JWT via Supabase's own token-validation endpoint.
  // getUser() hits the Supabase Auth server — it cannot be spoofed by a
  // tampered cookie the way a local getSession() decode could be.
  const anonClient = createServerClient(
    supabaseUrl,
    supabaseAnon,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // read-only in API routes
      },
    }
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser()

  if (authError || !user) {
    return {
      userId: null,
      schoolId: null,
      subRole: null,
      unauthorized: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  // Resolve the verified user's school and role from the server side.
  // Using the service client ensures we always get the row regardless of
  // whatever RLS policies are in effect on staff_records.
  const serviceClient = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  const { data: staff } = await serviceClient
    .from('staff_records')
    .select('school_id, sub_role')
    .eq('user_id', user.id)
    .single()

  if (!staff?.school_id) {
    return {
      userId: null,
      schoolId: null,
      subRole: null,
      unauthorized: NextResponse.json(
        { error: 'Forbidden: no staff record for this user' },
        { status: 403 }
      ),
    }
  }

  return {
    userId: user.id,
    schoolId: staff.school_id as string,
    subRole: (staff.sub_role ?? '') as string,
    unauthorized: null,
  }
}
