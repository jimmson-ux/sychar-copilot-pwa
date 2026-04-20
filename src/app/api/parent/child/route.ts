import { NextRequest, NextResponse } from 'next/server'
import { requireParentAuth } from '@/middleware/verifyParentJWT'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/parent/child
 * Returns basic profile for all children linked to the parent.
 * Never returns admission_number or internal UUIDs in the response.
 */
export async function GET(req: NextRequest) {
  const parent = await requireParentAuth(req)
  if (parent.unauthorized) return parent.unauthorized

  const svc = createAdminSupabaseClient()

  const { data: students, error } = await svc
    .from('students')
    .select(`
      id,
      full_name,
      date_of_birth,
      gender,
      photo_url,
      stream,
      class_id,
      classes ( name, level )
    `)
    .in('id', parent.studentIds)
    .eq('school_id', parent.schoolId)

  if (error) {
    return NextResponse.json({ error: 'Failed to load student data' }, { status: 500 })
  }

  return NextResponse.json({ students: students ?? [] })
}
