/**
 * Next.js 16 proxy (replaces middleware.ts).
 * File: proxy.ts  |  Export: proxy()  |  Config: proxyConfig
 *
 * Auth strategy (no DB calls — all cookie-based for speed):
 *   - Session gate : reads Supabase auth cookie directly
 *   - Role routing : reads `sychar-role` cookie (set by /login after sign-in)
 *   - Subscription : reads `sychar-sub` cookie  (set by /login; defaults 'active')
 *
 * Tenant resolution (subdomain → school_id):
 *   - Extracts slug from subdomain: nkoroi.sychar.co.ke → 'nkoroi'
 *   - Fetches tenant_configs via Supabase REST (Cloudflare-cached 5 min)
 *   - Injects x-school-id, x-school-slug, x-school-name, x-school-short-code headers
 *
 * Parent PWA (/parent/*, /api/parent/*) — always passes through.
 * Parent JWT is verified per-route by requireParentAuth().
 *
 * Role/sub cookies are routing hints only — not a security boundary.
 * Actual authorization is enforced by RLS + requireAuth() in every API route.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const PROJECT_REF  = SUPABASE_URL.replace('https://', '').split('.')[0]
const AUTH_COOKIE  = `sb-${PROJECT_REF}-auth-token`

const ROLE_COOKIE = 'sychar-role'
const SUB_COOKIE  = 'sychar-sub'

const PUBLIC_ROUTES = [
  '/login', '/auth', '/quick-report', '/super/login',
  '/talk', '/loc-verify', '/suspended', '/offline', '/record',
]

const SHARED_DASHBOARD_PREFIXES = [
  '/dashboard/students',
  '/dashboard/settings',
  '/dashboard/scanner',
  '/dashboard/notices',
]

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
    return true
  }
}

function dashboardFor(subRole: string): string {
  if (subRole === 'super_admin') return '/super/dashboard'
  if (subRole.startsWith('hod_')) return '/dashboard/hod'
  if (subRole.startsWith('deputy_principal')) return '/dashboard/deputy-admin'
  return ROLE_ROUTES[subRole] ?? '/dashboard/teacher'
}

// Extract school slug from subdomain: nkoroi.sychar.co.ke → 'nkoroi'
function extractSlug(req: NextRequest): string | null {
  const host  = (req.headers.get('host') ?? '').split(':')[0]
  const parts = host.split('.')
  // Dev: next.config.ts injects x-school-slug header for localhost
  const devSlug = req.headers.get('x-school-slug')
  if (parts.length >= 4) {
    const sub      = parts[0]
    const reserved = new Set(['www', 'admin', 'api', 'wazazi', 'mail'])
    if (!reserved.has(sub)) return sub
  }
  return devSlug ?? null
}

async function resolveTenant(slug: string): Promise<Record<string, string> | null> {
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!SUPABASE_URL || !supabaseAnon) return null
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tenant_configs?slug=eq.${encodeURIComponent(slug)}&select=school_id,name,slug,school_short_code&limit=1`,
      {
        headers: { apikey: supabaseAnon, Authorization: `Bearer ${supabaseAnon}` },
        // @ts-ignore cf is Cloudflare-specific (not in standard RequestInit)
        cf: { cacheTtl: 300, cacheEverything: true },
      }
    )
    if (!res.ok) return null
    const tenants = await res.json() as Record<string, string>[]
    return tenants[0] ?? null
  } catch {
    return null
  }
}

// Inject extra headers into both the forwarded request and the response
function withHeaders(req: NextRequest, extra: Record<string, string>): NextResponse {
  if (!Object.keys(extra).length) return NextResponse.next()
  const reqHeaders = new Headers(req.headers)
  Object.entries(extra).forEach(([k, v]) => reqHeaders.set(k, v))
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  Object.entries(extra).forEach(([k, v]) => res.headers.set(k, v))
  return res
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl

    // 1. Static assets — pass through immediately (no tenant resolution needed)
    if (
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon') ||
      /\.(ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|css|map)$/.test(pathname)
    ) {
      return NextResponse.next()
    }

    // 2. Tenant resolution from subdomain slug
    const slug         = extractSlug(request)
    const extraHeaders: Record<string, string> = {}

    if (slug) {
      const tenant = await resolveTenant(slug)
      if (tenant) {
        extraHeaders['x-school-id']         = tenant.school_id         ?? ''
        extraHeaders['x-school-slug']       = tenant.slug              ?? ''
        extraHeaders['x-school-name']       = tenant.name              ?? ''
        extraHeaders['x-school-short-code'] = tenant.school_short_code ?? ''
      } else if (!pathname.startsWith('/api/') && !pathname.startsWith('/parent/')) {
        // Unknown subdomain → redirect to marketing site
        return NextResponse.redirect(new URL('https://sychar.co.ke'))
      }
    }

    // 3. Parent PWA — always pass through (JWT verified per-route)
    if (pathname.startsWith('/parent/') || pathname.startsWith('/api/parent/')) {
      return withHeaders(request, extraHeaders)
    }

    // 4. Public paths
    const loggedIn  = hasSession(request)
    const subRole   = request.cookies.get(ROLE_COOKIE)?.value ?? ''
    const subStatus = request.cookies.get(SUB_COOKIE)?.value  ?? 'active'

    if (isPublicPath(pathname)) {
      if (loggedIn && subRole && pathname === '/login') {
        return NextResponse.redirect(new URL(dashboardFor(subRole), request.url))
      }
      return withHeaders(request, extraHeaders)
    }

    // 5. API routes — auth handled by requireAuth() in each handler
    if (pathname.startsWith('/api/')) {
      return withHeaders(request, extraHeaders)
    }

    // 6. Unauthenticated → /login
    if (!loggedIn) {
      const url = new URL('/login', request.url)
      url.searchParams.set('next', pathname)
      if (slug) url.searchParams.set('school', slug)
      return NextResponse.redirect(url)
    }

    // 7. Frozen / suspended → /suspended
    if (subStatus === 'suspended' || subStatus === 'frozen') {
      if (subRole === 'principal' && pathname.startsWith('/dashboard/principal')) {
        return withHeaders(request, extraHeaders)
      }
      return NextResponse.redirect(new URL('/suspended', request.url))
    }

    // 8. /super/* — super_admin only
    if (pathname.startsWith('/super/')) {
      if (subRole !== 'super_admin') {
        return NextResponse.redirect(new URL(subRole ? dashboardFor(subRole) : '/login', request.url))
      }
      return withHeaders(request, extraHeaders)
    }

    // 9. /dashboard root → role-based entry redirect
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      return NextResponse.redirect(new URL(subRole ? dashboardFor(subRole) : '/login', request.url))
    }

    // 10. /dashboard/* — prevent cross-role access
    if (pathname.startsWith('/dashboard/') && subRole) {
      const correctDashboard = dashboardFor(subRole)
      const isOwn    = pathname.startsWith(correctDashboard)
      const isHod    = correctDashboard === '/dashboard/hod' && pathname.startsWith('/dashboard/hod')
      const isShared = SHARED_DASHBOARD_PREFIXES.some(p => pathname.startsWith(p))

      if (!isOwn && !isHod && !isShared) {
        return NextResponse.redirect(new URL(correctDashboard, request.url))
      }
    }

    // 11. Grace period → pass through with banner header
    const res = withHeaders(request, extraHeaders)
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
