'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/lib/supabase'
import type { SchoolFeatures } from '@/lib/features'
import { hasFeature as _hasFeature } from '@/lib/features'
import type { School } from '@/lib/billing'

// ─────────────────────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────────────────────

type SchoolContextType = {
  school:     School | null
  features:   SchoolFeatures | null
  hasFeature: (flag: keyof SchoolFeatures) => boolean
  loading:    boolean
}

const SchoolContext = createContext<SchoolContextType | null>(null)

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

interface SchoolProviderProps {
  schoolId: string
  children: ReactNode
}

export function SchoolProvider({ schoolId, children }: SchoolProviderProps) {
  const [school, setSchool]   = useState<School | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!schoolId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchSchool() {
      setLoading(true)
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('schools')
          .select(
            'id, name, county, sub_county, knec_code, student_count, ' +
            'contact_name, contact_phone, contact_email, ' +
            'features, is_active, subscription_expires_at, created_at',
          )
          .eq('id', schoolId)
          .single()

        if (!cancelled) {
          if (error || !data) {
            setSchool(null)
          } else {
            setSchool(data as unknown as School)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSchool()
    return () => { cancelled = true }
  }, [schoolId])

  const features = school?.features ?? null

  const value: SchoolContextType = {
    school,
    features,
    hasFeature: (flag) => _hasFeature(features, flag),
    loading,
  }

  return (
    <SchoolContext.Provider value={value}>
      {children}
    </SchoolContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

export function useSchool(): SchoolContextType {
  const ctx = useContext(SchoolContext)
  if (!ctx) {
    throw new Error('useSchool() must be used inside <SchoolProvider>.')
  }
  return ctx
}
