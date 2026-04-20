'use client'

/**
 * SchoolThemeProvider
 *
 * Fetches /api/school/context on mount, injects CSS custom properties into
 * :root, and exposes SchoolContext to every child via React Context.
 *
 * Public routes (/login, /gate, /magazine/*, /talent/*, /talk, /super/*)
 * skip the authenticated fetch and use DEFAULT_CONTEXT so the provider
 * never blocks rendering on those pages.
 *
 * CSS properties injected:
 *   --school-primary          e.g. #1e40af
 *   --school-secondary        e.g. #22c55e
 *   --school-gradient-from    e.g. #1e40af
 *   --school-gradient-to      e.g. #22c55e
 *   --school-logo             url(/icon-192.png)
 *   --school-name             "Nkoroi Mixed Senior Secondary School"
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { SchoolContext } from '@/types/school'
import { DEFAULT_CONTEXT } from '@/types/school'

// ── Context ───────────────────────────────────────────────────────────────────

const SchoolCtx = createContext<SchoolContext>(DEFAULT_CONTEXT)

// Public routes that do NOT require auth — skip the context fetch entirely
const PUBLIC_PREFIXES = ['/login', '/gate', '/magazine', '/talent', '/talk', '/super', '/teacher-login', '/onboard']

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/'
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SchoolThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [ctx, setCtx] = useState<SchoolContext>(DEFAULT_CONTEXT)
  const [ready, setReady] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    // Public routes — apply defaults immediately, skip fetch
    if (isPublicRoute(pathname)) {
      applyTheme(DEFAULT_CONTEXT)
      setReady(true)
      return
    }

    // Only fetch once per session (context cached in module scope between navigations)
    if (fetchedRef.current) return
    fetchedRef.current = true

    // Try session cache first (survives client-side navigations)
    const cached = sessionStorage.getItem('sychar_school_ctx')
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as SchoolContext & { _ts: number }
        // 5-minute stale time — matches server Cache-Control
        if (Date.now() - (parsed._ts ?? 0) < 5 * 60 * 1000) {
          applyTheme(parsed)
          setCtx(parsed)
          setReady(true)
          return
        }
      } catch { /* corrupt cache — re-fetch */ }
    }

    fetch('/api/school/context')
      .then(r => r.ok ? r.json() : null)
      .then((data: SchoolContext | null) => {
        if (!data) { setReady(true); return }
        applyTheme(data)
        setCtx(data)
        // Cache with timestamp
        sessionStorage.setItem('sychar_school_ctx', JSON.stringify({ ...data, _ts: Date.now() }))
        setReady(true)
      })
      .catch(() => {
        // Network error — fall back to defaults, don't block render
        applyTheme(DEFAULT_CONTEXT)
        setReady(true)
      })
  }, [pathname])

  return (
    <SchoolCtx.Provider value={ctx}>
      {/* Render immediately — CSS vars land before first paint */}
      {children}
    </SchoolCtx.Provider>
  )
}

// ── Theme injector ────────────────────────────────────────────────────────────

function applyTheme(ctx: SchoolContext) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const t    = ctx.theme

  root.style.setProperty('--school-primary',        t.primary_color)
  root.style.setProperty('--school-secondary',      t.secondary_color)
  root.style.setProperty('--school-gradient-from',  t.gradient_from)
  root.style.setProperty('--school-gradient-to',    t.gradient_to)
  root.style.setProperty('--school-logo',           t.logo_url ? `url(${t.logo_url})` : 'none')
  root.style.setProperty('--school-name',           ctx.schoolName)
  root.style.setProperty('--school-motto',          t.school_motto)

  // Also update the browser theme-color meta (affects Android Chrome toolbar)
  const metaTheme = document.querySelector('meta[name="theme-color"]')
  if (metaTheme) metaTheme.setAttribute('content', t.primary_color)
}

// ── Context accessor (used by hooks below) ────────────────────────────────────

export function useSchoolContext(): SchoolContext {
  return useContext(SchoolCtx)
}
