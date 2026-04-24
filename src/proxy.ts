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

const ROLE_COOKIE = 'sychar-role'  // sub_role from staff_records
const SUB_COOKIE  = 'sychar-sub'   // school subscription status

const PUBLIC_ROUTES = [
  '/login', '/auth', '/quick-report', '/super/login',
  '/talk', '/loc-verify', '/suspended', '/offline', '/record',
]

// Shared utility pages any authenticated staff member may access
const SHARED_DASHBOARD_PREFIXES = [
  '/dashboard/students',
  '/dashboard/settings',
  '/dashboard/scanner',
  '/dashboard/notices',
]

// school_id resolved dynamically from session
const ROLE_ROUTES: Record<string, string> = {
  'principal':                   '/dashboard/principal',
  'deputy_principal_academic':   '/dashboard/deputy-academic',
  'deputy_principal_academics':  '/dashboard/deputy-academic',
  'deputy_principal_admin':      '/dashboard/deputy-admin',
  'deputy_principal_discipline': '/dashboard/deputy-admin',
  'dean_of_studies':             '/dashboard/dean',
  'deputy_dean_of_studies':      '/dashboard/dean',
  'dean_of_students':            '/dashboard/dean',
  'hod_sciences':                '/dashboard/hod',
  'hod_arts':                    '/dashboard/hod',
  'hod_languages':               '/dashboard/hod',
  'hod_mathematics':             '/dashboard/hod',
  'hod_social_sciences':         '/dashboard/hod',
  'hod_technical':               '/dashboard/hod',
  'hod_pathways':                '/dashboard/hod',
  'bursar':                      '/dashboard/bursar',
  'accountant':                  '/dashboard/bursar',
  'storekeeper':                 '/dashboard/storekeeper',
  'school_nurse':                '/dashboard/nurse',
  'class_teacher':               '/dashboard/teacher',
  'subject_teacher':             '/dashboard/teacher',
  'bom_teacher':                 '/dashboard/teacher',
  'counselor':                   '/dashboard/counselor',
  'librarian':                   '/dashboard/librarian',
  'quality_assurance':           '/dashboard/teacher',
  'super_admin':                 '/super/dashboard',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) return true
  if (pathname === '/api/auth/staff-list') return true
  if (pathname.startsWith('/api/gc/self-referral')) return true
  return false
}

function hasSession(req: NextRequest): boolean {
  try {
    if (req.cookies.get(AUTH_COOKIE)?.value)        return true
    if (req.cookies.get(`${AUTH_COOKIE}.0`)?.value) return true
    return req.cookies.getAll().some(
      c => c.name.includes(PROJECT_REF) && c.name.includes('auth-token') && !!c.value
    )
  } catch {
    return true  // permissive on parse error; dashboard re-validates via requireAuth()
  }
}

function dashboardFor(subRole: string): string {
  if (subRole === 'super_admin') return '/super/dashboard'
  if (subRole.startsWith('hod_')) return '/dashboard/hod'
  if (subRole.startsWith('deputy_principal')) return '/dashboard/deputy-admin'
  return ROLE_ROUTES[subRole] ?? '/dashboard/teacher'
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

    // ── API routes — auth handled by requireAuth() in each handler ─
    if (pathname.startsWith('/api/')) {
      return NextResponse.next()
    }

    // ── Unauthenticated → /login ──────────────────────────────
    if (!loggedIn) {
      const url = new URL('/login', request.url)
      url.searchParams.set('next', pathname)
      return NextResponse.redirect(url)
    }

    // ── Frozen / suspended → /suspended ──────────────────────
    if (subStatus === 'suspended' || subStatus === 'frozen') {
      // Principal can reach their dashboard to see payment/reinstatement options
      if (subRole === 'principal' && pathname.startsWith('/dashboard/principal')) {
        return NextResponse.next()
      }
      return NextResponse.redirect(new URL('/suspended', request.url))
    }

    // ── /super/* — super_admin only ───────────────────────────
    if (pathname.startsWith('/super/')) {
      if (subRole !== 'super_admin') {
        return NextResponse.redirect(new URL(subRole ? dashboardFor(subRole) : '/login', request.url))
      }
      return NextResponse.next()
    }

    // ── /dashboard root → role-based entry redirect ───────────
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      return NextResponse.redirect(new URL(subRole ? dashboardFor(subRole) : '/login', request.url))
    }

    // ── /dashboard/* — prevent accessing another role's dashboard ─
    if (pathname.startsWith('/dashboard/') && subRole) {
      const correctDashboard = dashboardFor(subRole)
      const isOwn    = pathname.startsWith(correctDashboard)
      const isHod    = correctDashboard === '/dashboard/hod' && pathname.startsWith('/dashboard/hod')
      const isShared = SHARED_DASHBOARD_PREFIXES.some(p => pathname.startsWith(p))

      if (!isOwn && !isHod && !isShared) {
        return NextResponse.redirect(new URL(correctDashboard, request.url))
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
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
