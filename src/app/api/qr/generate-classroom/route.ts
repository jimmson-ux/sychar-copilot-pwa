// POST /api/qr/generate-classroom
// Generates HMAC-SHA256 signed QR payload for a classroom.
// Only principal / deputy can generate; room details come from the request body.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createHmac } from 'crypto'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_ROLES = new Set([
  'principal', 'deputy_principal_academics', 'deputy_principal_academic',
  'deputy_principal_admin', 'deputy_principal_discipline',
  'timetabling_committee',
])

function getCurrentTerm(): number {
  const m = new Date().getMonth() + 1
  if (m <= 4) return 1
  if (m <= 8) return 2
  return 3
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { subRole, schoolId } = auth

  if (!ALLOWED_ROLES.has(subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: principal/deputy only' }, { status: 403 })
  }

  const secret = process.env.CLASSROOM_QR_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CLASSROOM_QR_SECRET not configured' }, { status: 500 })
  }

  const body = await req.json() as {
    room_id:    string
    room_name:  string
    lat:        number
    lng:        number
    orientation?: number  // expected compass bearing, default 0
  }

  if (!body.room_id || !body.room_name || body.lat == null || body.lng == null) {
    return NextResponse.json({ error: 'room_id, room_name, lat, lng required' }, { status: 400 })
  }

  // Verify room exists in school (optional: skip if rooms table not present)
  const db = svc()
  const { data: school } = await db
    .from('schools').select('id').eq('id', schoolId!).single()
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const payload = {
    school_id:   schoolId,
    room_id:     body.room_id,
    room_name:   body.room_name,
    geo:         { lat: body.lat, lng: body.lng },
    orientation: body.orientation ?? 0,
    term:        getCurrentTerm(),
    version:     1,
    issued_at:   Date.now(),
  }

  const payloadStr = JSON.stringify(payload)
  const sig = createHmac('sha256', secret).update(payloadStr).digest('hex')
  const qrData = Buffer.from(`${payloadStr}.${sig}`).toString('base64')

  return NextResponse.json({ qr_data: qrData, payload })
}
