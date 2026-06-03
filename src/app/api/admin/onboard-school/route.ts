// POST /api/admin/onboard-school
// Provisions a complete new school in one request (requires valid Supabase session):
//   1. Creates Supabase auth user with temp password
//   2. Calls register_school() RPC (atomically creates school + staff_record)
//   3. Patches school row with extra fields
//   4. Auto-generates + saves slug via generate_slug_from_name()
//   5. Sends welcome SMS to principal via Africa's Talking
// If auth user creation succeeds but RPC fails, the auth user is deleted (rollback).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/sms'
import { genTempPassword } from '@/lib/admin-utils'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Accept either cookie-based session or Bearer token from Authorization header
  const db = createAdminSupabaseClient()
  let authed = false

  const bearerToken = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/, '')
  if (bearerToken) {
    const { data: { user } } = await db.auth.getUser(bearerToken)
    authed = !!user
  }

  if (!authed) {
    const sessionClient = await createServerSupabaseClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    authed = !!user
  }

  if (!authed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as Record<string, string | number> | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const {
    school_name,
    county,
    sub_county,
    knec_code,
    student_count,
    short_name,
    tier,
    admin_name,
    admin_email,
    contact_phone,
    tsc_number,
  } = body as Record<string, string>

  if (!school_name || !county || !admin_name || !admin_email || !contact_phone) {
    return NextResponse.json(
      { error: 'Required: school_name, county, admin_name, admin_email, contact_phone' },
      { status: 422 }
    )
  }

  const tempPassword = genTempPassword(school_name)

  // ── Step 1: Create Supabase auth user ──────────────────────────────────────
  const { data: authData, error: authError } = await db.auth.admin.createUser({
    email:          admin_email,
    password:       tempPassword,
    email_confirm:  true,
    user_metadata:  { full_name: admin_name },
  })

  if (authError || !authData.user) {
    console.error('[onboard-school] auth.admin.createUser:', authError)
    return NextResponse.json(
      { error: authError?.message ?? 'Failed to create auth user' },
      { status: 422 }
    )
  }

  const adminUserId = authData.user.id

  // ── Step 2: register_school() RPC ──────────────────────────────────────────
  const { data: schoolId, error: rpcError } = await db.rpc('register_school', {
    p_school_name:   school_name,
    p_county:        county,
    p_admin_user_id: adminUserId,
    p_admin_name:    admin_name,
    p_admin_email:   admin_email,
    p_admin_role:    'principal',
  })

  if (rpcError || !schoolId) {
    console.error('[onboard-school] register_school RPC:', rpcError)
    // Rollback: delete the auth user we just created
    await db.auth.admin.deleteUser(adminUserId).catch(() => {})
    return NextResponse.json(
      { error: rpcError?.message ?? 'Failed to register school' },
      { status: 500 }
    )
  }

  // ── Step 3: Patch school row with extra fields ─────────────────────────────
  const patch: Record<string, string | number | null> = {}
  if (sub_county)    patch.sub_county    = sub_county
  if (knec_code)     patch.knec_code     = knec_code
  if (short_name)    patch.short_name    = short_name
  if (contact_phone) patch.contact_phone = contact_phone
  if (admin_email)   patch.contact_email = admin_email
  if (admin_name)    patch.contact_name  = admin_name
  if (tsc_number)    patch.tsc_number    = tsc_number
  if (student_count) patch.student_count = parseInt(String(student_count)) || 0
  if (tier)          patch.tier          = tier

  if (Object.keys(patch).length > 0) {
    await db.from('schools').update(patch).eq('id', schoolId)
  }

  // ── Step 4: Generate + save slug ───────────────────────────────────────────
  const { data: slug } = await db.rpc('generate_slug_from_name', { p_name: school_name })
  if (slug) {
    await db.from('tenant_configs')
      .upsert({ school_id: schoolId, slug }, { onConflict: 'school_id' })
    // The staff PWA resolves the tenant by schools.subdomain/code/name — set
    // subdomain to the slug so <slug>.sychar.co.ke resolves (not "School not found").
    await db.from('schools').update({ subdomain: slug }).eq('id', schoolId)
  }

  // ── Step 5: Fetch auto-generated short_code + resolved slug ───────────────
  const { data: tenant } = await db
    .from('tenant_configs')
    .select('school_short_code, slug')
    .eq('school_id', schoolId)
    .single()

  const shortCode    = tenant?.school_short_code ?? null
  const resolvedSlug = tenant?.slug ?? slug ?? null
  const staffPwaUrl  = resolvedSlug ? `https://${resolvedSlug}.sychar.co.ke` : null
  const parentPwaUrl = 'https://wazazi.sychar.co.ke'

  // ── Step 6: Send welcome SMS ───────────────────────────────────────────────
  if (contact_phone) {
    const smsBody = [
      `Welcome to Sychar, ${admin_name}!`,
      `School: ${school_name}`,
      `Login: ${staffPwaUrl ?? 'https://app.sychar.co.ke'}`,
      `Email: ${admin_email}`,
      `Temp password: ${tempPassword}`,
      `School code: ${shortCode ?? 'pending'}`,
      `Change your password on first login.`,
    ].join('\n')

    sendSMS(contact_phone, smsBody).catch(() => {})
  }

  return NextResponse.json(
    {
      school_id:         schoolId,
      school_short_code: shortCode,
      slug:              resolvedSlug,
      staff_pwa_url:     staffPwaUrl,
      parent_pwa_url:    parentPwaUrl,
      temp_password:     tempPassword,
      admin_email,
    },
    { status: 201 }
  )
}
