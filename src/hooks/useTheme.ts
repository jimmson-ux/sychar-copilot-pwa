'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useSchoolId } from './useSchoolId'

export interface SchoolTheme {
  name: string
  motto: string
  logoUrl: string | null
  themeColor: string
  secondaryColor: string
}

const DEFAULT_THEME: SchoolTheme = {
  name: 'School',
  motto: '',
  logoUrl: null,
  themeColor: '#1e40af',
  secondaryColor: '#059669',
}

// Cache per school so repeated hook calls don't re-fetch
const cache = new Map<string, SchoolTheme>()

export function useTheme(): { theme: SchoolTheme; loading: boolean } {
  const { schoolId } = useSchoolId()
  const [theme,   setTheme]   = useState<SchoolTheme>(DEFAULT_THEME)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) return

    if (cache.has(schoolId)) {
      setTheme(cache.get(schoolId)!)
      setLoading(false)
      return
    }

    const supabase = createClient()
    type Row = { name: string; motto: string | null; logo_url: string | null; theme_color: string | null; secondary_color: string | null }

    supabase
      .from('schools')
      .select('name, motto, logo_url, theme_color, secondary_color')
      .eq('id', schoolId)
      .single()
      .then(({ data }) => {
        const row = data as Row | null
        if (row) {
          const t: SchoolTheme = {
            name:           row.name           ?? 'School',
            motto:          row.motto          ?? '',
            logoUrl:        row.logo_url       ?? null,
            themeColor:     row.theme_color    ?? '#1e40af',
            secondaryColor: row.secondary_color ?? '#059669',
          }
          cache.set(schoolId, t)
          setTheme(t)
        }
        setLoading(false)
      }, () => setLoading(false))
  }, [schoolId])

  return { theme, loading }
}
