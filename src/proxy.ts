/**
 * Proxy (Next.js 16 — formerly `middleware.ts`). Auth gate + role routing.
 *
 * Auth strategy (no DB calls on the hot path — all cookie-based for speed):
 *   - Session gate : reads Supabase auth cookie directly
 *   - Role routing : reads `sychar-role` cookie (set by /login after sign-in)
 *   - Subscription : reads `sychar-sub` cookie  (set by /login; defaults 'active')
 *
 * Tenant resolution (subdomain → school): the slug is extracted from the
 * subdomain (nkoroi.sychar.co.ke → 'nkoroi') and used to (a) reject unknown
 * subdomains and (b) carry school context into /login. NOTE: we intentionally
 * do NOT inject x-school-* request headers — no route consumes them. Per-tenant
 * data scoping is enforced downstream by Postgres RLS (school_id) +
 * requireAuth()/staff_records.school_id in every API route, which is the real
 * security boundary. Role/sub cookies here are routing hints only.
 *
 * Parent PWA (/parent/*, /api/parent/*) — always passes through; the parent JWT
 * is verified per-route by requireParentAuth().
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
  '/dashboard/attendance',
  '/dashboard/discipline',
  '/dashboard/timetable',
  '/dashboard/merit-list',
  '/dashboard/qr-management',
  '/dashboard/document-compliance',
  '/dashboard/university-matching',
  '/dashboard/subject-performance',
]

const ROLE_ROUTES: Record<string, string> = {
  // ── Principal ──────────────────────────────────────────────────────
  'principal':                   '/dashboard/principal',
  // ── Deputy principal — Nkoroi uses flat 'deputy_principal' ─────────
  'deputy_principal':            '/dashboard/deputy',
  'deputy_principal_academic':   '/dashboard/deputy-academic',
  'deputy_principal_academics':  '/dashboard/deputy-academic',
  'deputy_principal_admin':      '/dashboard/deputy-admin',
  'deputy_principal_discipline': '/dashboard/deputy-admin',
  // ── Academic leadership ────────────────────────────────────────────
  'dean_of_studies':             '/dashboard/dean',
  'deputy_dean_of_studies':      '/dashboard/dean',
  'dean_of_students':            '/dashboard/dean-students',
  // ── HODs ───────────────────────────────────────────────────────────
  'hod_sciences':                '/dashboard/hod',
  'hod_mathematics':             '/dashboard/hod',
  'hod_languages':               '/dashboard/hod',
  'hod_humanities':              '/dashboard/hod',
  'hod_applied_sciences':        '/dashboard/hod',
  'hod_games_sports':            '/dashboard/hod',
  'hod_arts':                    '/dashboard/hod',
  'hod_social_sciences':         '/dashboard/hod',
  'hod_technical':               '/dashboard/hod',
  'hod_pathways':                '/dashboard/hod',
  // ── Finance / admin ────────────────────────────────────────────────
  'bursar':                      '/dashboard/bursar',
  'accountant':                  '/dashboard/bursar',
  'storekeeper':                 '/dashboard/storekeeper',
  // ── Welfare / specialist ──────────────────────────────────────────
  'school_nurse':                '/dashboard/nurse',
  'guidance_counselling':        '/dashboard/counselor',
  'counselor':                   '/dashboard/counselor',
  'qaso':                        '/dashboard/qaso',
  // ── Teachers ──────────────────────────────────────────────────────
  'class_teacher':               '/dashboard/teacher',
  'subject_teacher':             '/dashboard/teacher',
  'form_principal_form4':        '/dashboard/teacher',
  'form_principal_grade10':      '/dashboard/teacher',
  'bom_teacher':                 '/dashboard/teacher',
  'quality_assurance':           '/dashboard/teacher',
  // ── Other ─────────────────────────────────────────────────────────
  'librarian':                   '/dashboard/librarian',
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
  if (subRole === 'super_admin')      return '/super/dashboard'
  if (subRole === 'deputy_principal') return '/dashboard/deputy'
  if (subRole.startsWith('hod_'))     return '/dashboard/hod'
  if (subRole.startsWith('deputy_principal_')) return '/dashboard/deputy-admin'
  return ROLE_ROUTES[subRole] ?? '/dashboard/teacher'
}

function extractSlug(req: NextRequest): string | null {
  const host  = (req.headers.get('host') ?? '').split(':')[0]
  const parts = host.split('.')
  const devSlug = req.headers.get('x-school-slug')
  if (parts.length >= 4) {
    const sub      = parts[0]
    const reserved = new Set(['www', 'admin', 'api', 'wazazi', 'mail'])
    if (!reserved.has(sub)) return sub
  }
  return devSlug ?? null
}

/** Returns true if the slug maps to a known tenant (Cloudflare-cached 5 min).
 *  Uses the get_tenant_by_slug RPC (returns safe columns only) — anon no longer
 *  has direct SELECT on tenant_configs, which holds secrets. */
async function tenantExists(slug: string): Promise<boolean> {
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  if (!SUPABASE_URL || !supabaseAnon) return false
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_tenant_by_slug`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${supabaseAnon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_slug: slug }),
      // @ts-ignore cf is Cloudflare-specific
      cf: { cacheTtl: 300, cacheEverything: true },
    })
    if (!res.ok) return false
    const tenants = (await res.json()) as unknown[]
    return Array.isArray(tenants) && tenants.length > 0
  } catch {
    return false
  }
}

// ── Proxy ───────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  try {
    const { pathname } = request.nextUrl

    // 1. Static assets — pass through immediately
    if (
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon') ||
      /\.(ico|png|jpg|jpeg|gif|svg|webp|woff2?|ttf|otf|css|map)$/.test(pathname)
    ) {
      return NextResponse.next()
    }

    // 2. Tenant resolution from subdomain slug — reject unknown subdomains
    //    (no x-school-* headers are injected; RLS + requireAuth() scope data).
    const slug = extractSlug(request)
    if (
      slug &&
      !pathname.startsWith('/api/') &&
      !pathname.startsWith('/parent/') &&
      !(await tenantExists(slug))
    ) {
      return NextResponse.redirect(new URL('https://sychar.co.ke'))
    }

    // 3. Parent PWA — always pass through (JWT verified per-route)
    if (pathname.startsWith('/parent/') || pathname.startsWith('/api/parent/')) {
      return NextResponse.next()
    }

    // 4. Public paths
    const loggedIn  = hasSession(request)
    const subRole   = request.cookies.get(ROLE_COOKIE)?.value ?? ''
    const subStatus = request.cookies.get(SUB_COOKIE)?.value  ?? 'active'

    if (isPublicPath(pathname)) {
      if (loggedIn && subRole && pathname === '/login') {
        return NextResponse.redirect(new URL(dashboardFor(subRole), request.url))
      }
      return NextResponse.next()
    }

    // 5. API routes — auth handled by requireAuth() in each handler
    if (pathname.startsWith('/api/')) {
      return NextResponse.next()
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
        return NextResponse.next()
      }
      return NextResponse.redirect(new URL('/suspended', request.url))
    }

    // 8. /super/* and /admin/* — super_admin only
    if (pathname.startsWith('/super/') || pathname.startsWith('/admin')) {
      if (subRole !== 'super_admin') {
        return NextResponse.redirect(new URL(subRole ? dashboardFor(subRole) : '/login', request.url))
      }
      return NextResponse.next()
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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico).*)',
  ],
}
