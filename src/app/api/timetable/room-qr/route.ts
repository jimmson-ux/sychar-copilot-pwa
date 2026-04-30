// POST /api/timetable/room-qr — generate or rotate a room QR code
// GET  /api/timetable/room-qr — list all room QR codes for this school
// Only principal / deputy roles can generate.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { SignJWT } from 'jose'

const ADMIN_ROLES = new Set([
  'principal',
  'deputy_principal',
  'deputy_principal_admin',
  'deputy_principal_academics',
  'deputy_principal_academic',
])

function encoder() {
  return new TextEncoder().encode(process.env.SYCHAR_QR_SECRET ?? 'sychar-qr-fallback')
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db = createAdminSupabaseClient()
  const { data, error } = await db
    .from('room_qr_codes')
    .select('id, room_name, qr_url, is_active, created_at')
    .eq('school_id', auth.schoolId)
    .order('room_name')

  if (error) return NextResponse.json({ error: 'Failed to fetch room QRs' }, { status: 500 })
  return NextResponse.json({ rooms: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!ADMIN_ROLES.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden — principal or deputy only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as { room_name?: string }
  const { room_name } = body

  if (!room_name?.trim()) {
    return NextResponse.json({ error: 'room_name is required' }, { status: 400 })
  }

  const payload = {
    school_id: auth.schoolId,
    room_name: room_name.trim(),
    purpose:   'teacher_checkin',
    is_static: true,
  }

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(encoder())

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const qr_url = `${appUrl}/teacher/checkin?token=${jwt}`

  const db = createAdminSupabaseClient()
  const { data, error } = await db
    .from('room_qr_codes')
    .upsert([{
      school_id:  auth.schoolId,
      room_name:  room_name.trim(),
      qr_token:   jwt,
      qr_url,
      is_active:  true,
      created_by: auth.userId,
    }], { onConflict: 'school_id,room_name' })
    .select('id, room_name, qr_url, qr_token')
    .single()

  if (error) {
    console.error('[room-qr] upsert error:', error)
    return NextResponse.json({ error: 'Failed to create room QR' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, room: data })
}
