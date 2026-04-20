/**
 * useSchoolId — resolves the authenticated user's school_id from staff_records.
 *
 * Replaces the hardcoded SCHOOL_ID constant for client components.
 *
 * Usage:
 *   const { schoolId, loading } = useSchoolId()
 *   if (!schoolId) return null
 *   supabase.from('students').select('*').eq('school_id', schoolId)
 *
 * For server-side / API routes use requireAuth() in src/lib/requireAuth.ts
 * which already returns schoolId dynamically.
 */

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

export function useSchoolId() {
  const [schoolId, setSchoolId] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    let cancelled = false

    async function resolve() {
      try {
        const supabase = getSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || cancelled) return

        const { data } = await supabase
          .from('staff_records')
          .select('school_id')
          .eq('user_id', user.id)
          .single()

        if (!cancelled) setSchoolId(data?.school_id ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    resolve()
    return () => { cancelled = true }
  }, [])

  return { schoolId, loading }
}
