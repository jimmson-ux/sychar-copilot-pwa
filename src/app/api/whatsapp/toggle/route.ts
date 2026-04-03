// PATCH /api/whatsapp/toggle — enable/disable WhatsApp bot (principal only)

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const Schema = z.object({ enabled: z.boolean() })

export async function PATCH(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'hod_pathways'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
  }

  const { error } = await getSb()
    .from('school_settings')
    .update({ whatsapp_bot_enabled: parsed.data.enabled })
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ success: true, enabled: parsed.data.enabled })
}
