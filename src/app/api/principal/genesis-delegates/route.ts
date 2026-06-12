import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/principal/genesis-delegates
 *
 * Lets the PRINCIPAL delegate the Genesis capabilities — generating the
 * per-class lesson-attendance QR ('generate_qr') and locking a classroom
 * geofence ('lock_geofence') — to staff members of their choosing.
 *
 *   GET    → { delegates, candidates, max, used }
 *   POST   → grant   { staff_id, capabilities?: ['generate_qr','lock_geofence'] }
 *   DELETE → revoke  ?staff_id=...&capability=(optional)
 *
 * Per-school cap: tenant_configs.genesis_max_delegates limits the number of
 * DISTINCT delegated staff (NULL = unlimited). The deputy principal and the
 * principal are always implicitly allowed and never count against the cap.
 */

const CAPABILITIES = ['generate_qr', 'lock_geofence'] as const
type Capability = (typeof CAPABILITIES)[number]

const MANAGE_ROLES = new Set(['principal', 'super_admin'])

function isManager(subRole: string): boolean {
  return MANAGE_ROLES.has(subRole)
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!isManager(auth.subRole)) {
    return NextResponse.json({ error: 'Only the principal can manage Genesis delegates.' }, { status: 403 })
  }

  const svc = createAdminSupabaseClient()

  const [{ data: grants }, { data: staff }, { data: cfg }] = await Promise.all([
    svc
      .from('genesis_delegations')
      .select('id, staff_id, capability, granted_at')
      .eq('school_id', auth.schoolId)
      .eq('is_active', true),
    svc
      .from('staff_records')
      .select('id, full_name, sub_role')
      .eq('school_id', auth.schoolId)
      .eq('can_login', true)
      .eq('is_active', true)
      .order('full_name'),
    svc
      .from('tenant_configs')
      .select('genesis_max_delegates')
      .eq('school_id', auth.schoolId)
      .maybeSingle(),
  ])

  type Grant = { id: string; staff_id: string; capability: Capability; granted_at: string }
  type Staff = { id: string; full_name: string; sub_role: string | null }

  const staffById = new Map((staff as Staff[] ?? []).map((s) => [s.id, s]))

  // Group active grants by staff member.
  const byStaff = new Map<string, { staff_id: string; full_name: string; sub_role: string | null; capabilities: Capability[] }>()
  for (const g of (grants as Grant[] ?? [])) {
    const entry = byStaff.get(g.staff_id) ?? {
      staff_id: g.staff_id,
      full_name: staffById.get(g.staff_id)?.full_name ?? 'Unknown',
      sub_role: staffById.get(g.staff_id)?.sub_role ?? null,
      capabilities: [],
    }
    entry.capabilities.push(g.capability)
    byStaff.set(g.staff_id, entry)
  }

  return NextResponse.json({
    delegates: Array.from(byStaff.values()),
    candidates: staff ?? [],
    max: (cfg as { genesis_max_delegates: number | null } | null)?.genesis_max_delegates ?? null,
    used: byStaff.size,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!isManager(auth.subRole)) {
    return NextResponse.json({ error: 'Only the principal can manage Genesis delegates.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { staff_id } = body as { staff_id?: string; capabilities?: string[] }
  const requested = (body as { capabilities?: string[] }).capabilities
  const capabilities: Capability[] = Array.isArray(requested) && requested.length
    ? (requested.filter((c) => (CAPABILITIES as readonly string[]).includes(c)) as Capability[])
    : [...CAPABILITIES]

  if (!staff_id?.trim()) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
  }
  if (!capabilities.length) {
    return NextResponse.json({ error: 'No valid capabilities supplied' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  // Resolve the granting principal's staff id (for the audit trail).
  const { data: grantor } = await svc
    .from('staff_records')
    .select('id')
    .eq('user_id', auth.userId)
    .single()

  // Target must belong to this school.
  const { data: target } = await svc
    .from('staff_records')
    .select('id, full_name')
    .eq('id', staff_id.trim())
    .eq('school_id', auth.schoolId)
    .maybeSingle()
  if (!target) {
    return NextResponse.json({ error: 'Staff member not found in this school' }, { status: 404 })
  }

  // ── Enforce per-school cap on distinct delegated staff ──────────
  const { data: cfg } = await svc
    .from('tenant_configs')
    .select('genesis_max_delegates')
    .eq('school_id', auth.schoolId)
    .maybeSingle()
  const max = (cfg as { genesis_max_delegates: number | null } | null)?.genesis_max_delegates ?? null

  if (max != null) {
    const { data: existingGrants } = await svc
      .from('genesis_delegations')
      .select('staff_id')
      .eq('school_id', auth.schoolId)
      .eq('is_active', true)
    const distinct = new Set((existingGrants as { staff_id: string }[] ?? []).map((g) => g.staff_id))
    if (!distinct.has(staff_id.trim()) && distinct.size >= max) {
      return NextResponse.json(
        { error: `This school's Genesis delegate limit (${max}) has been reached. Revoke an existing delegate first.` },
        { status: 409 },
      )
    }
  }

  // Upsert active grants for each requested capability.
  const rows = capabilities.map((capability) => ({
    school_id: auth.schoolId,
    staff_id: staff_id.trim(),
    capability,
    granted_by: (grantor as { id: string } | null)?.id ?? null,
    granted_at: new Date().toISOString(),
    revoked_at: null,
    is_active: true,
  }))

  const { error } = await svc
    .from('genesis_delegations')
    .upsert(rows, { onConflict: 'school_id,staff_id,capability', ignoreDuplicates: false })

  if (error) {
    console.error('[genesis-delegates] grant', error)
    return NextResponse.json({ error: 'Failed to grant delegation' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    staff_id: staff_id.trim(),
    full_name: (target as { full_name: string }).full_name,
    capabilities,
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!isManager(auth.subRole)) {
    return NextResponse.json({ error: 'Only the principal can manage Genesis delegates.' }, { status: 403 })
  }

  const url = new URL(req.url)
  const staffId = url.searchParams.get('staff_id')
  const capability = url.searchParams.get('capability')
  if (!staffId) {
    return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()

  let q = svc
    .from('genesis_delegations')
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq('school_id', auth.schoolId)
    .eq('staff_id', staffId)
    .eq('is_active', true)

  if (capability && (CAPABILITIES as readonly string[]).includes(capability)) {
    q = q.eq('capability', capability)
  }

  const { error } = await q
  if (error) {
    console.error('[genesis-delegates] revoke', error)
    return NextResponse.json({ error: 'Failed to revoke delegation' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, staff_id: staffId, revoked: capability ?? 'all' })
}
