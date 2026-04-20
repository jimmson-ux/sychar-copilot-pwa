import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET  /api/admin/voucher-packages          — list all packages for school
 * POST /api/admin/voucher-packages          — create new package
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const svc = createAdminSupabaseClient()
  const { data, error } = await svc
    .from('voucher_packages')
    .select('*')
    .eq('school_id', auth.schoolId)
    .order('price')

  if (error) return NextResponse.json({ error: 'Failed to load packages' }, { status: 500 })
  return NextResponse.json({ packages: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const body = await req.json().catch(() => ({}))
  const { name, description, price, meals_count, valid_days } = body as {
    name?:        string
    description?: string
    price?:       number
    meals_count?: number
    valid_days?:  number
  }

  if (!name || !price || !meals_count) {
    return NextResponse.json({ error: 'name, price, and meals_count are required' }, { status: 400 })
  }
  if (price <= 0 || meals_count <= 0) {
    return NextResponse.json({ error: 'price and meals_count must be positive' }, { status: 400 })
  }

  const svc = createAdminSupabaseClient()
  const { data, error } = await svc
    .from('voucher_packages')
    .insert({
      school_id:   auth.schoolId,
      name,
      description: description ?? null,
      price,
      meals_count,
      valid_days:  valid_days ?? 30,
      is_active:   true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create package' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
