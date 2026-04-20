// GET /api/school-theme — public endpoint, no auth required.
// Returns theming data for the login page.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

let _sb: ReturnType<typeof createClient> | null = null
function getSb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return _sb
}

export async function GET() {
  const schoolId = process.env.NEXT_PUBLIC_SCHOOL_ID!

  const { data, error } = await getSb()
    .from('schools')
    .select('name, motto, logo_url, theme_color, secondary_color, login_style, banner_url')
    .eq('id', schoolId)
    .single()

  type SchoolThemeRow = { name: string; motto: string | null; logo_url: string | null; theme_color: string | null; secondary_color: string | null; login_style: string | null; banner_url: string | null }
  const row = data as SchoolThemeRow | null

  if (error || !row) {
    return NextResponse.json({
      name: 'School',
      motto: '',
      logoUrl: null,
      themeColor: '#1e40af',
      secondaryColor: '#059669',
      loginStyle: 'clean',
      bannerUrl: null,
    })
  }

  return NextResponse.json({
    name:           row.name,
    motto:          row.motto ?? '',
    logoUrl:        row.logo_url ?? null,
    themeColor:     row.theme_color ?? '#1e40af',
    secondaryColor: row.secondary_color ?? '#059669',
    loginStyle:     row.login_style ?? 'clean',
    bannerUrl:      row.banner_url ?? null,
  })
}
