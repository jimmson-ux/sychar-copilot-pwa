/**
 * GET /api/school/context
 *
 * Returns the full SchoolContext for the authenticated user's school.
 * Used by SchoolThemeProvider on mount.
 *
 * Cache strategy: the client caches with React Query staleTime: 5min.
 * Server adds Cache-Control: private, max-age=300 so repeated
 * page navigations in the same session don't re-fetch.
 *
 * School context almost never changes mid-session — safe to cache aggressively.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import type { SchoolContext, SchoolTheme, FeaturesEnabled } from '@/types/school'
import { DEFAULT_THEME, DEFAULT_FEATURES } from '@/types/school'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()

  // Parallel: school_metadata + school_settings (for current_term / academic_year)
  const [metaRes, settingsRes] = await Promise.all([
    db
      .from('school_metadata')
      .select('*')
      .eq('school_id', auth.schoolId)
      .single(),
    db
      .from('school_settings')
      .select('current_term, current_academic_year, school_name, principal_phone')
      .eq('school_id', auth.schoolId)
      .single(),
  ])

  const meta     = metaRes.data
  const settings = settingsRes.data

  // Merge theme — prefer school_metadata.theme, fill gaps with defaults
  const rawTheme  = (meta?.theme ?? {}) as Partial<SchoolTheme>
  const theme: SchoolTheme = { ...DEFAULT_THEME, ...rawTheme }

  // Merge features
  const rawFeatures  = (meta?.features_enabled ?? {}) as Partial<FeaturesEnabled>
  const featuresEnabled: FeaturesEnabled = { ...DEFAULT_FEATURES, ...rawFeatures }

  // Resolve current term label
  const termNum   = settings?.current_term ?? meta?.current_term ?? 1
  const termLabel = `Term ${termNum}`
  const year      = settings?.current_academic_year ?? meta?.academic_year ?? new Date().getFullYear().toString()

  const context: SchoolContext = {
    schoolId:        auth.schoolId,
    schoolName:      meta?.name ?? settings?.school_name ?? 'My School',
    shortName:       meta?.short_name ?? meta?.name?.split(' ').slice(0, 2).join(' ') ?? 'My School',
    schoolType:      (meta?.school_type ?? 'day') as SchoolContext['schoolType'],
    curriculumMix:   (meta?.curriculum_mix ?? 'fusion') as SchoolContext['curriculumMix'],
    theme,
    featuresEnabled,
    currentTerm:     termLabel,
    academicYear:    year,
    principalPhone:  meta?.principal_phone ?? settings?.principal_phone ?? '',
    knecCode:        meta?.knec_code ?? '',
    county:          meta?.county ?? '',
  }

  return NextResponse.json(context, {
    headers: {
      'Cache-Control': 'private, max-age=300, stale-while-revalidate=600',
    },
  })
}
