import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * /api/meetings — general school meetings + minutes (ALL schools): BOM, staff, PTA,
 * academic, committee. (Department meetings keep using /api/hod/meetings.)
 *   GET  → meetings for the school
 *   POST → convene { meeting_type, title, agenda?, scheduled_at?, venue?, minute_taker_id?, summon? }
 *          summon: 'staff'|'all'|role[] → web-push invite. (secretary/leadership/HOD)
 */
const CONVENE = new Set(['secretary', 'principal', 'deputy_principal', 'deputy_principal_academic', 'deputy_principal_admin', 'super_admin', 'dean_of_studies', 'dean_of_students'])
const TYPES = new Set(['bom', 'staff', 'department', 'pta', 'academic', 'committee', 'other'])

export async function GET() {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  const svc = createAdminSupabaseClient()
  const { data, error } = await svc.from('meetings')
    .select('id, meeting_type, department, title, agenda, scheduled_at, venue, minute_taker_id, status, summary, minuted_at, created_at')
    .eq('school_id', auth.schoolId).order('scheduled_at', { ascending: false, nullsFirst: false }).limit(150)
  if (error) return NextResponse.json({ error: 'Failed' }, { status: 500 })
  return NextResponse.json({ meetings: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(); if (auth.unauthorized) return auth.unauthorized
  if (!CONVENE.has(auth.subRole) && !auth.subRole.startsWith('hod_')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as any
  if (!b.title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const meeting_type = TYPES.has(b.meeting_type) ? b.meeting_type : 'other'
  const svc = createAdminSupabaseClient()
  const { data: me } = await svc.from('staff_records').select('id, full_name').eq('user_id', auth.userId).single()
  const meId = (me as { id: string } | null)?.id ?? null

  const { data, error } = await svc.from('meetings').insert({
    school_id: auth.schoolId, meeting_type, department: b.department ?? null, title: b.title.trim(),
    agenda: b.agenda ?? null, scheduled_at: b.scheduled_at ?? null, venue: b.venue ?? null,
    convener_id: meId, minute_taker_id: b.minute_taker_id ?? null, status: 'scheduled', created_by: meId,
  }).select('id').single()
  if (error) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  const when = b.scheduled_at ? new Date(b.scheduled_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' }) : 'soon'
  const payload = { title: `${meeting_type.toUpperCase()} meeting: ${b.title.trim()}`, body: `${when}${b.venue ? ' @ ' + b.venue : ''}`, url: '/dashboard', tag: 'meeting', renotify: true }
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-push`
  const hdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  if (b.summon === 'all' || b.summon === 'staff') {
    fetch(base, { method: 'POST', headers: hdr, body: JSON.stringify({ audience: 'all', school_id: auth.schoolId, payload }) }).catch(() => {})
  } else if (Array.isArray(b.summon) && b.summon.length) {
    fetch(base, { method: 'POST', headers: hdr, body: JSON.stringify({ audience: 'role', value: b.summon, school_id: auth.schoolId, payload }) }).catch(() => {})
  }
  if (b.minute_taker_id) {
    fetch(base, { method: 'POST', headers: hdr, body: JSON.stringify({ audience: 'staff', value: b.minute_taker_id, school_id: auth.schoolId, payload: { ...payload, title: 'You are taking the minutes', body: `For "${b.title.trim()}" (${when}).` } }) }).catch(() => {})
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id, meeting_type })
}
