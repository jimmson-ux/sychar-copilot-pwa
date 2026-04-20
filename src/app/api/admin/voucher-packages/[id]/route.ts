import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * PUT    /api/admin/voucher-packages/[id]  — update package
 * DELETE /api/admin/voucher-packages/[id]  — soft-delete (set is_active=false)
 */

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { name, description, price, meals_count, valid_days, is_active } = body as {
    name?:        string
    description?: string
    price?:       number
    meals_count?: number
    valid_days?:  number
    is_active?:   boolean
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name        !== undefined) update.name        = name
  if (description !== undefined) update.description = description
  if (price       !== undefined) update.price       = price
  if (meals_count !== undefined) update.meals_count = meals_count
  if (valid_days  !== undefined) update.valid_days  = valid_days
  if (is_active   !== undefined) update.is_active   = is_active

  const svc = createAdminSupabaseClient()
  const { data, error } = await svc
    .from('voucher_packages')
    .update(update)
    .eq('id', id)
    .eq('school_id', auth.schoolId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: 'Package not found or update failed' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const svc = createAdminSupabaseClient()

  // Soft-delete: deactivate only — preserve vouchers already issued
  const { error } = await svc
    .from('voucher_packages')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to deactivate package' }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
