import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public endpoint — returns staff names for the /record landing screen.
// No sensitive data exposed (no phone, no sub_role details).

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_SUB_ROLES = [
  'class_teacher', 'bom_teacher', 'guidance_counselling',
  'hod_subjects', 'hod_pathways',
]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const schoolId = searchParams.get('schoolId')
  if (!schoolId) return NextResponse.json({ error: 'Missing schoolId' }, { status: 400 })

  const sb = getClient()
  const { data, error } = await sb
    .from('staff_records')
    .select('id, full_name, subject_specialization, sub_role')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .in('sub_role', ALLOWED_SUB_ROLES)
    .order('full_name')

  if (error) return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })
  return NextResponse.json({ staff: data ?? [] })
}
