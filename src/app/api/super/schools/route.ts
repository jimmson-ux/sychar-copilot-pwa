export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

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

// POST /api/super/schools — create new school tenant with auto-generated short code
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const {
    name, county, sub_county, knec_code,
    student_count, contact_name, contact_phone, contact_email,
    admin_email, admin_password, subscription_days,
  } = body

  if (!name || !county || !admin_email || !admin_password) {
    return NextResponse.json({ error: 'name, county, admin_email, admin_password required' }, { status: 400 })
  }

  const db = adminClient()

  // 1. Create the admin auth user
  const { data: userData, error: userErr } = await db.auth.admin.createUser({
    email:           admin_email,
    password:        admin_password,
    email_confirm:   true,
  })
  if (userErr || !userData.user) {
    const msg = userErr?.message ?? ''
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const userId = userData.user.id

  // 2. Create school + staff record via RPC
  const { data: schoolId, error: rpcErr } = await db.rpc('register_school', {
    p_school_name:   name,
    p_county:        county,
    p_admin_user_id: userId,
    p_admin_name:    contact_name || admin_email,
    p_admin_email:   admin_email,
    p_admin_role:    'principal',
  })

  if (rpcErr || !schoolId) {
    // Roll back: delete the auth user we just created
    await db.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // 3. Patch extra columns on schools row
  const expires = new Date(Date.now() + (subscription_days ?? 365) * 86_400_000).toISOString()
  await db.from('schools').update({
    sub_county:              sub_county   || null,
    knec_code:               knec_code    || null,
    student_count:           parseInt(student_count) || 0,
    contact_name:            contact_name || null,
    contact_phone:           contact_phone || null,
    contact_email:           contact_email || null,
    is_active:               true,
    subscription_expires_at: expires,
  }).eq('id', schoolId)

  // 4. Generate unique short code
  const { data: shortCode } = await db.rpc('generate_school_short_code')

  // 5. Upsert tenant_configs with the short code
  await db.from('tenant_configs').upsert({
    school_id:         schoolId,
    school_short_code: shortCode,
  }, { onConflict: 'school_id' })

  // 6. Audit log
  void db.from('god_mode_audit').insert({
    actor_id:    auth.ctx.userId,
    actor_email: auth.ctx.email,
    action:      'school_create',
    entity_type: 'school',
    entity_id:   schoolId,
    meta:        { name, county, admin_email, short_code: shortCode },
  })

  return NextResponse.json({ ok: true, school_id: schoolId, short_code: shortCode })
}
