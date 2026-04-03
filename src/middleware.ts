import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Static assets and non-page routes — always pass through
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/record')
  ) {
    return NextResponse.next()
  }

  // Build response first so we can forward refreshed cookies
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Server-side Supabase that reads/writes the auth cookies
  // This is the SSR-correct way — syncs session from cookies, not localStorage
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh + validate the session (also refreshes the auth cookie)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isDashboard = pathname.startsWith('/dashboard')
  const isLogin     = pathname === '/login'

  // Unauthenticated user trying to reach dashboard → send to login
  if (isDashboard && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user hitting the login page → send to dashboard
  if (isLogin && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static assets
    '/((?!_next/static|_next/image|favicon\\.ico|icon-192\\.png|icon-512\\.png|icon-maskable-512\\.png|apple-touch-icon\\.png|manifest\\.json|sw\\.js|.*\\.svg|.*\\.png|.*\\.ico|.*\\.webp|.*\\.avif).*)',
  ],
}
