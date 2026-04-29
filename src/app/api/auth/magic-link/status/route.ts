// GET /api/auth/magic-link/status?t=TOKEN
// Polled by the new device every 2s to know when the push was approved.
// Returns: { status: 'pending'|'approved'|'expired', actionLink? }

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t')?.trim()
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const svc = createAdminSupabaseClient()

  const { data } = await svc
    .from('magic_links')
    .select('is_used, expires_at, action_link')
    .eq('token', token)
    .single()

  if (!data) return NextResponse.json({ status: 'expired' })

  if (data.is_used) {
    return NextResponse.json({ status: 'approved', actionLink: data.action_link })
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ status: 'expired' })
  }

  return NextResponse.json({ status: 'pending' })
}
