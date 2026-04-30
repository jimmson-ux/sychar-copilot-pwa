// PATCH /api/alerts/[id] — mark single alert as read

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const db      = createAdminSupabaseClient()

  const { error } = await db
    .from('alerts')
    .update({ is_read: true })
    .eq('id', id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
