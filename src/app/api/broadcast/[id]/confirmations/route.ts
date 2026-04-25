// GET /api/broadcast/[id]/confirmations — real-time confirmation count for a broadcast

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const db = svc()

  const { data: broadcast, error } = await db
    .from('emergency_broadcasts')
    .select('id, recipient_count, sms_count, confirmed_count, sent_at, broadcast_type, message')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (error || !broadcast) {
    return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
  }

  type BroadcastRow = {
    id: string
    recipient_count: number
    sms_count: number
    confirmed_count: number
    sent_at: string
    broadcast_type: string
    message: string
  }
  const b = broadcast as BroadcastRow

  const percentage = b.recipient_count > 0
    ? Math.round((b.confirmed_count / b.recipient_count) * 100)
    : 0

  return NextResponse.json({
    broadcastId:    b.id,
    broadcastType:  b.broadcast_type,
    sentAt:         b.sent_at,
    total:          b.recipient_count,
    smsDelivered:   b.sms_count,
    confirmed:      b.confirmed_count,
    percentage,
  })
}
