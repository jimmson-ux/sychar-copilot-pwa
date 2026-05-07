// GET /api/students/class-options
// Returns distinct class-stream combinations for the subject teacher
// class picker dropdown. All teacher roles may call this.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()

  const { data, error } = await db
    .from('students')
    .select('class_name,stream_name')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .order('class_name')
    .order('stream_name')

  if (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const seen = new Set<string>()
  const options = (data ?? []).reduce<{ class_name: string; stream_name: string; label: string }[]>(
    (acc, row) => {
      const key = `${row.class_name}-${row.stream_name}`
      if (!seen.has(key)) {
        seen.add(key)
        acc.push({
          class_name:  row.class_name,
          stream_name: row.stream_name,
          label:       `${row.class_name} ${row.stream_name}`,
        })
      }
      return acc
    }, []
  )

  return NextResponse.json({ classOptions: options })
}
