/**
 * Edge-safe middleware — NO @supabase/ssr, NO network calls.
 *
 * Why: @supabase/ssr v0.9.0 has no edge-runtime exports and calling
 * supabase.auth.getUser() from the Edge runtime caused MIDDLEWARE_INVOCATION_FAILED (500).
 *
 * Strategy: read the Supabase session cookie directly. The cookie is set by
 * createBrowserClient (cookie storage) after a successful signInWithPassword.
 * Cookie name pattern: sb-<project-ref>-auth-token
 * where project-ref = first subdomain of NEXT_PUBLIC_SUPABASE_URL.
 *
 * Deep session validation (JWT verification) is intentionally left to the
 * dashboard layout's client-side supabase.auth.getUser() call. The middleware
 * only gate-keeps routing — it does NOT need to be the security boundary.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Derive the project ref from the env var at build time so the Edge bundle
// contains a literal string rather than a runtime env lookup.
// Pattern: https://<ref>.supabase.co  →  <ref>
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const PROJECT_REF  = SUPABASE_URL.replace('https://', '').split('.')[0]
// The cookie createBrowserClient (no custom storageKey) writes is:
const AUTH_COOKIE  = `sb-${PROJECT_REF}-auth-token`

function hasSession(request: NextRequest): boolean {
  try {
    // Primary cookie (full session JSON)
    if (request.cookies.get(AUTH_COOKIE)?.value) return true
    // Supabase sometimes splits large cookies; check for the first chunk
    if (request.cookies.get(`${AUTH_COOKIE}.0`)?.value) return true
    // Fallback: any cookie whose name contains the project ref and 'auth-token'
    return request.cookies.getAll().some(
      c => c.name.includes(PROJECT_REF) && c.name.includes('auth-token') && !!c.value
    )
  } catch {
    // If cookie parsing fails, be permissive — dashboard will handle auth
    return true
  }
}

export function middleware(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl

    const isDashboard = pathname.startsWith('/dashboard')
    const isLogin     = pathname === '/login'

    // Only intercept dashboard and login — everything else passes straight through
    if (!isDashboard && !isLogin) {
      return NextResponse.next()
    }

    const loggedIn = hasSession(request)

    // Unauthenticated → block dashboard, send to login
    if (isDashboard && !loggedIn) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Already authenticated → skip the login page
    if (isLogin && loggedIn) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return NextResponse.next()
  } catch (err) {
    // Never let middleware crash the app — log and pass through
    console.error('[middleware] unexpected error:', err)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    // Only run on /dashboard/* and /login — skip all static assets
    '/dashboard/:path*',
    '/login',
  ],
}
