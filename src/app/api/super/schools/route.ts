// GET /api/super/schools
// Returns all registered schools with subscription data. Requires super_admin sub_role.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()

  // Verify session
  const anonClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user }, error: authError } = await anonClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify super_admin using service role (bypasses RLS)
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: staff } = await serviceClient
    .from('staff_records')
    .select('sub_role')
    .eq('user_id', user.id)
    .single()

  if (staff?.sub_role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch schools + subscriptions in parallel
  const [schoolsRes, subsRes, staffCountRes] = await Promise.all([
    serviceClient
      .from('schools')
      .select('id, name, county, tier, is_active, created_at, theme_color, logo_url')
      .order('created_at', { ascending: false }),

    serviceClient
      .from('school_subscriptions')
      .select('school_id, status, trial_ends_at, amount_paid, sms_used, sms_quota'),

    serviceClient
      .from('staff_records')
      .select('school_id, id', { count: 'exact' })
      .eq('is_active', true),
  ])

  if (schoolsRes.error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Index subscriptions by school_id
  type SubRow = { school_id: string; status: string; trial_ends_at: string | null; amount_paid: number; sms_used: number; sms_quota: number }
  const subMap = new Map<string, SubRow>()
  for (const sub of (subsRes.data ?? []) as SubRow[]) {
    subMap.set(sub.school_id, sub)
  }

  // Staff count per school
  type StaffRow = { school_id: string }
  const staffPerSchool = new Map<string, number>()
  for (const row of (staffCountRes.data ?? []) as StaffRow[]) {
    staffPerSchool.set(row.school_id, (staffPerSchool.get(row.school_id) ?? 0) + 1)
  }

  type SchoolRow = { id: string; name: string; county: string | null; tier: string; is_active: boolean; created_at: string; theme_color: string | null; logo_url: string | null }

  const schools = (schoolsRes.data as SchoolRow[]).map(s => {
    const sub = subMap.get(s.id) ?? null
    const staffCount = staffPerSchool.get(s.id) ?? 0

    // Compute health: green/amber/red
    let health: 'green' | 'amber' | 'red' = 'green'
    if (!s.is_active) {
      health = 'red'
    } else if (sub) {
      const daysLeft = sub.trial_ends_at
        ? Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000)
        : null
      const smsNearLimit = sub.sms_quota > 0 && (sub.sms_used / sub.sms_quota) > 0.85
      if (daysLeft !== null && daysLeft <= 7) health = 'amber'
      if (smsNearLimit) health = 'amber'
      if (sub.status === 'suspended') health = 'red'
      if (sub.status === 'expired')   health = 'red'
    }

    return {
      id:        s.id,
      name:      s.name,
      county:    s.county,
      tier:      s.tier,
      isActive:  s.is_active,
      createdAt: s.created_at,
      themeColor: s.theme_color,
      logoUrl:   s.logo_url,
      staffCount,
      health,
      subscription: sub ? {
        status:       sub.status,
        trialEndsAt:  sub.trial_ends_at,
        amountPaid:   sub.amount_paid,
        smsUsed:      sub.sms_used,
        smsQuota:     sub.sms_quota,
      } : null,
    }
  })

  // Summary stats
  const summary = {
    total:    schools.length,
    active:   schools.filter(s => s.isActive).length,
    green:    schools.filter(s => s.health === 'green').length,
    amber:    schools.filter(s => s.health === 'amber').length,
    red:      schools.filter(s => s.health === 'red').length,
    totalRevenue: (subsRes.data as SubRow[] ?? []).reduce((s, r) => s + (r.amount_paid ?? 0), 0),
  }

  return NextResponse.json({ schools, summary })
}
