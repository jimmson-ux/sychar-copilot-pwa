// GET  /api/onboard/[token] — validate signed token, return dept + school info
// POST /api/onboard/[token] — complete onboarding: search staff record by name + set password

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface TokenPayload {
  dept:      string
  school_id: string
  hod_id:    string
  exp:       number
}

function verifyToken(token: string): TokenPayload | null {
  const secret = process.env.HOD_ONBOARD_SECRET
  if (!secret) return null
  try {
    const raw   = Buffer.from(token, 'base64url').toString('utf8')
    const dot   = raw.lastIndexOf('.')
    if (dot === -1) return null
    const payloadStr = raw.slice(0, dot)
    const sig        = raw.slice(dot + 1)
    const expected   = createHmac('sha256', secret).update(payloadStr).digest('hex')
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(payloadStr) as TokenPayload
    if (payload.exp < Date.now()) return null
    return payload
  } catch { return null }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const payload   = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

  const db = svc()
  const { data: school } = await db
    .from('schools')
    .select('name, motto, logo_url, theme_color')
    .eq('id', payload.school_id)
    .single()

  const { data: hod } = await db
    .from('staff_records')
    .select('full_name')
    .eq('id', payload.hod_id)
    .single()

  return NextResponse.json({
    dept:      payload.dept,
    school_id: payload.school_id,
    school:    school ?? null,
    hod_name:  (hod as { full_name: string } | null)?.full_name ?? 'Your HOD',
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const payload   = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 400 })

  const body = await req.json() as { name: string; password: string; subjects?: string[] }
  if (!body.name?.trim() || !body.password) {
    return NextResponse.json({ error: 'name and password required' }, { status: 400 })
  }
  if (body.password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = svc()

  // Fuzzy search for staff by name in this school + department
  const { data: candidates } = await db
    .from('staff_records')
    .select('id, full_name, user_id, department, force_password_change')
    .eq('school_id', payload.school_id)
    .eq('department', payload.dept)
    .ilike('full_name', `%${body.name.trim()}%`)

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: 'No staff record found for that name in this department. Ask your HOD to check your name.' }, { status: 404 })
  }

  if (candidates.length > 1) {
    return NextResponse.json({
      error: 'Multiple staff found with that name. Please use your full name exactly as registered.',
      candidates: (candidates as Array<{ full_name: string }>).map((c) => c.full_name),
    }, { status: 409 })
  }

  const staff = candidates[0] as { id: string; full_name: string; user_id: string | null; department: string; force_password_change: boolean }

  if (!staff.user_id) {
    return NextResponse.json({ error: 'Your account has not been created yet. Ask your principal to set up your account first.' }, { status: 403 })
  }

  // Set the password via Supabase admin API
  const { error: pwErr } = await db.auth.admin.updateUserById(staff.user_id, { password: body.password })
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })

  // Mark force_password_change = false and record onboard_used_at
  await db.from('staff_records').update({
    force_password_change: false,
    onboard_used_at:       new Date().toISOString(),
  }).eq('id', staff.id)

  // Update subjects if provided
  if (body.subjects && body.subjects.length > 0) {
    // subjects field on staff_records (if exists) — optional, best-effort
    await db.from('staff_records').update({ subjects: body.subjects }).eq('id', staff.id).then(() => {})
  }

  return NextResponse.json({ ok: true, staff_name: staff.full_name })
}
