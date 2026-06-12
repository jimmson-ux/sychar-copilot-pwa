import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { createHmac } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * POST /api/deputy/qr/generate
 *
 * Generates (or regenerates) the anti-cheat static QR code for a class.
 *
 * Authorization (principal-delegable):
 *   - Anyone holding the 'generate_qr' Genesis capability may generate:
 *     implicit leadership, legacy default roles, or an explicit grant the
 *     principal made via /api/principal/genesis-delegates.
 *   - Checked through the has_genesis_capability() SQL function so the API
 *     and edge functions share one source of truth.
 *
 * Anti-cheat:
 *   - QR payload = HMAC-SHA256(school_id:class_id:seq, CLASS_QR_SECRET)
 *   - Even a perfect photocopy is useless: the backend only accepts scans
 *     from the teacher assigned to that class in the current period AND
 *     (under strict_geofence) from inside the locked classroom geofence.
 *
 * Body: { class_id: string, class_name: string }
 * Returns: { qr_payload, token_id, class_id, class_name, generation_seq }
 */

function buildToken(schoolId: string, classId: string, seq: number): string {
  const secret = process.env.CLASS_QR_SECRET
  if (!secret) throw new Error('CLASS_QR_SECRET env var not set')
  return createHmac('sha256', secret)
    .update(`${schoolId}:${classId}:${seq}`)
    .digest('hex')
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { class_id, class_name } = body as { class_id?: string; class_name?: string }

  if (!class_id?.trim() || !class_name?.trim()) {
    return NextResponse.json({ error: 'class_id and class_name are required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Get the generating staff record id
  const { data: staff } = await svc
    .from('staff_records')
    .select('id, full_name, sub_role')
    .eq('user_id', auth.userId)
    .single()

  if (!staff) {
    return NextResponse.json({ error: 'Staff record not found' }, { status: 404 })
  }

  // ── Capability check (principal-delegable) ─────────────────────
  const { data: canGenerate } = await svc.rpc('has_genesis_capability', {
    p_staff_id: (staff as { id: string }).id,
    p_capability: 'generate_qr',
  })
  if (!canGenerate) {
    return NextResponse.json(
      { error: 'You are not authorised to generate class QR codes. Ask the principal to delegate this to you.' },
      { status: 403 },
    )
  }

  // ── Look up any existing QR for this class ─────────────────────
  const { data: existing } = await svc
    .from('class_qr_tokens')
    .select('id, generator_role, generation_seq, generated_by')
    .eq('school_id', auth.schoolId)
    .eq('class_id', class_id.trim())
    .single()

  // Any authorised delegate may (re)generate the class QR. The principal
  // controls who holds the capability, so there is no cross-role lockout —
  // regenerating bumps the sequence and invalidates the previous code.
  const generatorRole = (staff as { sub_role: string }).sub_role

  // ── Build token ────────────────────────────────────────────────
  const seq         = existing ? ((existing as { generation_seq: number }).generation_seq + 1) : 1
  const tokenHash   = buildToken(auth.schoolId, class_id.trim(), seq)
  const qrPayload   = JSON.stringify({
    v: 1,
    s: auth.schoolId,
    c: class_id.trim(),
    t: tokenHash,
    seq,
  })

  // ── Upsert QR record ───────────────────────────────────────────
  const { data: record, error: upsertErr } = await svc
    .from('class_qr_tokens')
    .upsert(
      {
        school_id:      auth.schoolId,
        class_id:       class_id.trim(),
        class_name:     class_name.trim(),
        token_hash:     tokenHash,
        generation_seq: seq,
        qr_payload:     qrPayload,
        generated_by:   (staff as { id: string }).id,
        generator_role: generatorRole,
        is_active:      true,
        generated_at:   new Date().toISOString(),
        deactivated_at: null,
        deactivated_by: null,
      },
      { onConflict: 'school_id,class_id' },
    )
    .select('id, generation_seq')
    .single()

  if (upsertErr || !record) {
    console.error('[qr/generate]', upsertErr)
    return NextResponse.json({ error: 'Failed to generate QR' }, { status: 500 })
  }

  return NextResponse.json({
    token_id:       (record as { id: string }).id,
    class_id:       class_id.trim(),
    class_name:     class_name.trim(),
    generation_seq: (record as { generation_seq: number }).generation_seq,
    qr_payload:     qrPayload,
    generated_by:   (staff as { full_name: string }).full_name,
    generator_role: generatorRole,
  })
}

// GET — list all QR tokens for the school (any 'generate_qr' capability holder)
export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const svc = createAdminSupabaseClient()

  const { data: viewer } = await svc
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  const { data: canView } = viewer
    ? await svc.rpc('has_genesis_capability', {
        p_staff_id: (viewer as { id: string }).id,
        p_capability: 'generate_qr',
      })
    : { data: false }

  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await svc
    .from('class_qr_tokens')
    .select(
      'id, class_id, class_name, generation_seq, generator_role, is_active, generated_at, scan_count, last_scanned_at',
    )
    .eq('school_id', auth.schoolId)
    .order('class_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ tokens: data ?? [] })
}
