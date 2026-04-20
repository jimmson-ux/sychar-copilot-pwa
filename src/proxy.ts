/**
 * Next.js 16 proxy (replaces middleware.ts).
 * File: proxy.ts  |  Export: proxy()  |  Config: proxyConfig
 *
 * Auth strategy (Edge-safe — no DB calls, no @supabase/ssr):
 *   - Session gate : reads Supabase auth cookie directly
 *   - Role routing : reads `sychar-role` cookie (set by /login after sign-in)
 *   - Subscription : reads `sychar-sub` cookie  (set by /login; defaults 'active')
 *
 * The role/sub cookies are routing hints only — not a security boundary.
 * Actual authorization is enforced by RLS + requireAuth() in every API route.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const PROJECT_REF  = SUPABASE_URL.replace('https://', '').split('.')[0]
const AUTH_COOKIE  = `sb-${PROJECT_REF}-auth-token`

const ROLE_COOKIE  = 'sychar-role'   // sub_role from staff_records
const SUB_COOKIE   = 'sychar-sub'    // school subscription status

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Paths that never require a session */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login'               ||
    pathname === '/super/login'         ||
    pathname === '/suspended'           ||
    pathname.startsWith('/auth/')       ||
    pathname.startsWith('/record')      ||     // teacher QR submission page
    pathname.startsWith('/quick-report')||
    pathname.startsWith('/talk')        ||     // public voice/chat interface
    pathname === '/api/auth/staff-list'        // public staff list for login UI
  )
}

/** Returns true when a valid Supabase session cookie is present */
function hasSession(req: NextRequest): boolean {
  try {
    if (req.cookies.get(AUTH_COOKIE)?.value)        return true
    if (req.cookies.get(`${AUTH_COOKIE}.0`)?.value) return true
    return req.cookies.getAll().some(
      c => c.name.includes(PROJECT_REF) && c.name.includes('auth-token') && !!c.value
    )
  } catch {
    return true  // be permissive on parse error; dashboard re-validates
  }
}

/**
 * Map sub_role → canonical dashboard path.
 * Pages at these paths exist (or are thin wrappers around shared components).
 */
function dashboardFor(subRole: string): string {
  if (subRole === 'super_admin')                           return '/super/dashboard'
  if (subRole === 'principal')                             return '/dashboard/principal'
  // Differentiate the two deputy variants
  if (subRole === 'deputy_principal_academic'  ||
      subRole === 'deputy_principal_academics')            return '/dashboard/deputy-academic'
  if (subRole === 'deputy_principal_admin'     ||
      subRole === 'deputy_principal_discipline')           return '/dashboard/deputy-admin'
  if (subRole.startsWith('deputy_principal'))              return '/dashboard/deputy'  // fallback
  if (
    subRole === 'dean_of_studies'        ||
    subRole === 'deputy_dean_of_studies' ||
    subRole === 'dean_of_students'
  )                                                        return '/dashboard/dean'
  if (subRole.startsWith('hod_'))                         return '/dashboard/hod'
  if (subRole === 'bursar' || subRole === 'accountant')   return '/dashboard/bursar'
  if (subRole === 'storekeeper')                          return '/dashboard/storekeeper'
  if (subRole === 'school_nurse')                         return '/dashboard/nurse'
  if (
    subRole === 'class_teacher'  ||
    subRole === 'bom_teacher'    ||
    subRole === 'subject_teacher'
  )                                                        return '/dashboard/teacher'
  return '/dashboard'
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

export function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl

    // Static assets — pass through immediately
    if (
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon') ||
      /\.(ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|css|map)$/.test(pathname)
    ) {
      return NextResponse.next()
    }

    const loggedIn  = hasSession(request)
    const subRole   = request.cookies.get(ROLE_COOKIE)?.value ?? ''
    const subStatus = request.cookies.get(SUB_COOKIE)?.value  ?? 'active'

    // ── Public paths ─────────────────────────────────────────
    if (isPublicPath(pathname)) {
      // Authenticated users visiting /login → send to their dashboard
      if (loggedIn && subRole && pathname === '/login') {
        return NextResponse.redirect(new URL(dashboardFor(subRole), request.url))
      }
      return NextResponse.next()
    }

    // ── Unauthenticated → /login ──────────────────────────────
    if (!loggedIn) {
      const url = new URL('/login', request.url)
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    // ── Frozen / suspended school → /suspended ───────────────
    if (subStatus === 'suspended' || subStatus === 'frozen') {
      return NextResponse.redirect(new URL('/suspended', request.url))
    }

    // ── /super/* — super_admin only ───────────────────────────
    if (pathname.startsWith('/super/')) {
      if (subRole !== 'super_admin') {
        const target = subRole ? dashboardFor(subRole) : '/dashboard'
        return NextResponse.redirect(new URL(target, request.url))
      }
      return NextResponse.next()
    }

    // ── /dashboard (root exact) — role-based entry redirect ───
    // Only redirect the root path so sub-paths always render their own content.
    if (pathname === '/dashboard' && subRole) {
      const target = dashboardFor(subRole)
      if (target !== '/dashboard') {
        return NextResponse.redirect(new URL(target, request.url))
      }
    }

    // ── Grace period → pass through with banner header ───────
    const res = NextResponse.next()
    if (subStatus === 'grace_period') {
      res.headers.set('x-subscription-status', 'grace_period')
    }
    return res
  } catch (err) {
    console.error('[proxy] error:', err)
    return NextResponse.next()
  }
}

export const proxyConfig = {
  matcher: [
    // All routes except Next.js static internals
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
