// GET /api/auth/staff-list
// Public endpoint — returns loginable staff for the login page staff cards.
// No auth required: only returns id, full_name, sub_role, email, assigned_class_name, department (no secrets).

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SCHOOL_ID = process.env.NEXT_PUBLIC_SCHOOL_ID ?? '68bd8d34-f2f0-4297-bd18-093328824d84'

let _sb: ReturnType<typeof createClient> | null = null
function getSb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _sb
}

const SORT_ORDER: Record<string, number> = {
  principal:               1,
  deputy_principal:        2,
  dean_of_studies:         3,
  deputy_dean_of_studies:  4,
  dean_of_students:        5,
  form_principal_form4:    6,
  form_principal_grade10:  7,
  guidance_counselling:    8,
  hod_sciences:            9,
  hod_mathematics:        10,
  hod_languages:          11,
  hod_humanities:         12,
  hod_applied_sciences:   13,
  hod_games_sports:       14,
  class_teacher:          15,
  accountant:             20,
  storekeeper:            21,
  qaso:                   22,
}

export async function GET() {
  const { data, error } = await getSb()
    .from('staff_records')
    .select('id, full_name, sub_role, email, assigned_class_name, department')
    .eq('school_id', SCHOOL_ID)
    .eq('can_login', true)
    .eq('is_active', true)
    .order('full_name')

  if (error) return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 })

  type Row = {
    id: string
    full_name: string
    sub_role: string | null
    email: string | null
    assigned_class_name: string | null
    department: string | null
  }

  const sorted = (data as Row[] ?? []).sort((a, b) =>
    (SORT_ORDER[a.sub_role ?? ''] ?? 50) - (SORT_ORDER[b.sub_role ?? ''] ?? 50) ||
    a.full_name.localeCompare(b.full_name)
  )

  return NextResponse.json({ staff: sorted })
}
