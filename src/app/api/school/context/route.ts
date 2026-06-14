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

  // Parallel: school_metadata + school_settings + lifecycle gates (suspend / maintenance).
  const [metaRes, settingsRes, schoolRes, tenantRes, globalRes] = await Promise.all([
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
    db.from('schools').select('is_active').eq('id', auth.schoolId).maybeSingle(),
    db.from('tenant_configs').select('features').eq('school_id', auth.schoolId).maybeSingle(),
    db.from('global_settings').select('maintenance_mode, maintenance_message').eq('id', 1).maybeSingle(),
  ])

  const meta     = metaRes.data
  const settings = settingsRes.data

  // Access gates the PWA enforces with a lock screen:
  //   suspended   → billing/admin suspend (schools.is_active=false)
  //   maintenance → global OR this school's tenant_configs.features.maintenance_mode
  const suspended = schoolRes.data?.is_active === false
  const tcFeatures = (tenantRes.data?.features ?? {}) as { maintenance_mode?: boolean; maintenance_message?: string }
  const globalMaint = globalRes.data?.maintenance_mode === true
  const schoolMaint = tcFeatures.maintenance_mode === true
  const maintenance = globalMaint || schoolMaint
  const maintenanceMessage = schoolMaint
    ? (tcFeatures.maintenance_message || 'This school portal is temporarily under maintenance.')
    : (globalRes.data?.maintenance_message || 'Sychar is temporarily under maintenance.')

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
    genderProfile:   (meta?.gender_profile ?? 'mixed') as SchoolContext['genderProfile'],
    curriculumMix:   (meta?.curriculum_mix ?? 'fusion') as SchoolContext['curriculumMix'],
    theme,
    featuresEnabled,
    currentTerm:     termLabel,
    academicYear:    year,
    principalPhone:  meta?.principal_phone ?? settings?.principal_phone ?? '',
    knecCode:        meta?.knec_code ?? '',
    county:          meta?.county ?? '',
  }

  // Surface the lifecycle gates alongside context so SchoolThemeProvider can render a lock
  // screen. When locked we shorten the cache so reactivation is picked up quickly.
  const locked = suspended || maintenance
  return NextResponse.json(
    { ...context, suspended, maintenance, maintenanceMessage },
    {
      headers: {
        'Cache-Control': locked
          ? 'private, max-age=15, stale-while-revalidate=30'
          : 'private, max-age=300, stale-while-revalidate=600',
      },
    },
  )
}
