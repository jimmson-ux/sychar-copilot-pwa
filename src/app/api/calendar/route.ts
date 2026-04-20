// GET  /api/calendar — fetch events for this school (all authenticated staff)
// POST /api/calendar — create event (principal/deputy/bursar)
//                      optional: blast=true sends WhatsApp to all registered parents

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { sendBulkWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const db     = svc()
  const from   = req.nextUrl.searchParams.get('from')  ?? new Date().toISOString().split('T')[0]
  const to     = req.nextUrl.searchParams.get('to')
  const cat    = req.nextUrl.searchParams.get('category')

  let query = db
    .from('school_calendar')
    .select('id, title, event_date, event_time, category, description, audience, whatsapp_blast_sent, created_at')
    .eq('school_id', auth.schoolId!)
    .gte('event_date', from)
    .order('event_date')
    .limit(100)

  if (to)  query = query.lte('event_date', to)
  if (cat) query = query.eq('category', cat)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ events: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'deputy', 'bursar'].includes(auth.subRole ?? '')) {
    return NextResponse.json({ error: 'Forbidden: principal/deputy/bursar only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    title:       string
    event_date:  string
    event_time?: string
    category?:   string
    description?: string
    audience?:   string
    blast?:      boolean   // send WhatsApp blast to parents?
  }

  if (!body.title || !body.event_date) {
    return NextResponse.json({ error: 'title and event_date required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  const { data: event, error } = await db
    .from('school_calendar')
    .insert({
      school_id:   auth.schoolId,
      title:       body.title,
      event_date:  body.event_date,
      event_time:  body.event_time  ?? null,
      category:    body.category    ?? 'general',
      description: body.description ?? null,
      audience:    body.audience    ?? 'all',
      created_by:  (staff as { id: string } | null)?.id ?? null,
    })
    .select('id, title, event_date, event_time, category')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ev = event as { id: string; title: string; event_date: string; event_time: string | null; category: string }
  let blastResult: { sent: number; failed: number } | null = null

  // Optional WhatsApp blast to all parents
  if (body.blast && ['all', 'parents'].includes(body.audience ?? 'all')) {
    const { data: sessions } = await db
      .from('parent_bot_sessions')
      .select('phone')
      .eq('school_id', auth.schoolId!)
      .eq('state', 'active')
      .eq('consent_given', true)

    const phones = ((sessions ?? []) as { phone: string }[]).map(s => s.phone)

    if (phones.length > 0) {
      const d = new Date(ev.event_date).toLocaleDateString('en-KE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      const t = ev.event_time ? ` at ${ev.event_time.slice(0, 5)}` : ''
      const icon = { academic: '📚', sports: '⚽', cultural: '🎭', holiday: '🏖️', exam: '✏️', general: '📅' }[ev.category] ?? '📅'
      const blastMsg = `${icon} *School Calendar Update*\n\n*${ev.title}*\n📅 ${d}${t}${body.description ? `\n\n${body.description}` : ''}`

      blastResult = await sendBulkWhatsApp(phones, blastMsg)
      await db.from('school_calendar').update({ whatsapp_blast_sent: true }).eq('id', ev.id)
    }
  }

  return NextResponse.json({ ok: true, event: ev, blast: blastResult })
}
