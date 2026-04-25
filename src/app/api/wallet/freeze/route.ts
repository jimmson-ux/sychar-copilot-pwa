// POST /api/wallet/freeze — freeze or unfreeze a student wallet
// Feature: pocket_money
// Allowed: principal, bursar (freeze/unfreeze), parent (freeze only via parentId check)

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { tenantHasFeature } from '@/lib/tenantFeature'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const STAFF_ROLES = new Set(['principal', 'bursar', 'deputy_principal'])

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!await tenantHasFeature(auth.schoolId!, 'pocket_money')) {
    return NextResponse.json({ error: 'pocket_money feature not enabled for this school' }, { status: 403 })
  }

  const isStaff = STAFF_ROLES.has(auth.subRole)
  if (!isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null) as {
    studentId: string
    freeze:    boolean
    reason?:   string
  } | null

  if (!body?.studentId || typeof body.freeze !== 'boolean') {
    return NextResponse.json({ error: 'studentId and freeze (boolean) required' }, { status: 400 })
  }

  if (body.freeze && !body.reason?.trim()) {
    return NextResponse.json({ error: 'reason required when freezing' }, { status: 400 })
  }

  const db = svc()

  const { data: wallet, error: fetchErr } = await db
    .from('student_wallets')
    .select('id, is_frozen')
    .eq('school_id', auth.schoolId!)
    .eq('student_id', body.studentId)
    .single()

  if (fetchErr || !wallet) {
    return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
  }

  const w = wallet as { id: string; is_frozen: boolean }
  const now = new Date().toISOString()

  const update = body.freeze
    ? { is_frozen: true,  frozen_by: auth.userId, frozen_at: now, freeze_reason: body.reason!.trim() }
    : { is_frozen: false, frozen_by: null,         frozen_at: null, freeze_reason: null }

  const { error } = await db
    .from('student_wallets')
    .update(update)
    .eq('id', w.id)

  if (error) {
    console.error('[wallet/freeze] POST error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  await db.from('system_logs').insert({
    school_id:  auth.schoolId,
    actor_id:   auth.userId,
    action:     body.freeze ? 'wallet_frozen' : 'wallet_unfrozen',
    target_type: 'student_wallet',
    target_id:   w.id,
    detail:     { student_id: body.studentId, reason: body.reason ?? null },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, frozen: body.freeze, walletId: w.id })
}
