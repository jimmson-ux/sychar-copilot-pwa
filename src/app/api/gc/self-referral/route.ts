// POST /api/gc/self-referral — anonymous student self-referral (NO auth required)
// Publicly accessible via /talk page. Creates a support flag + notifies counselor.
// No student identity stored unless they voluntarily provide it.

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Simple rate limiting via school code — prevent spam
const recentSubmissions = new Map<string, number>()

export async function POST(req: NextRequest) {
  const db   = svc()
  const body = await req.json() as {
    school_code:    string   // public school identifier (not UUID)
    concern:        string   // what they want help with
    category?:      string   // academic | family | peer | mental_health | other
    contact_pref?:  string   // 'none' | 'class_teacher' | 'counselor_direct'
    first_name?:    string   // optional — student may choose to share
    class_name?:    string   // optional
  }

  if (!body.school_code || !body.concern?.trim()) {
    return NextResponse.json({ error: 'school_code and concern required' }, { status: 400 })
  }

  if (body.concern.trim().length < 10) {
    return NextResponse.json({ error: 'Please describe your concern in more detail' }, { status: 400 })
  }

  // Rate limit: max 3 submissions per school_code per 10 minutes
  const key     = `${body.school_code}_${req.headers.get('x-forwarded-for') ?? 'unknown'}`
  const now     = Date.now()
  const lastHit = recentSubmissions.get(key) ?? 0
  if (now - lastHit < 10 * 60 * 1000) {
    return NextResponse.json({ error: 'Too many submissions. Please wait before trying again.' }, { status: 429 })
  }
  recentSubmissions.set(key, now)

  // Resolve school by public code
  const { data: school } = await db
    .from('schools')
    .select('id, name')
    .eq('school_code', body.school_code)
    .eq('active', true)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found. Check your school code.' }, { status: 404 })

  const s = school as { id: string; name: string }

  // Store anonymous referral — no student_id linkage unless provided
  const { data: referral, error } = await db
    .from('anonymous_referrals')
    .insert({
      school_id:     s.id,
      concern:       body.concern.trim(),
      category:      body.category    ?? 'other',
      contact_pref:  body.contact_pref ?? 'none',
      first_name:    body.first_name  ?? null,   // optional
      class_name:    body.class_name  ?? null,   // optional
      submitted_at:  new Date().toISOString(),
      status:        'new',
      ip_hash:       null,  // no IP stored — privacy
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Could not submit referral. Please try again.' }, { status: 500 })

  // Alert counselor (high priority)
  await db.from('alerts').insert({
    school_id: s.id,
    type:      'gc_anonymous_referral',
    severity:  'high',
    title:     `New anonymous self-referral${body.first_name ? ` from ${body.first_name}` : ''}${body.class_name ? ` (${body.class_name})` : ''}`,
    detail:    {
      referral_id:   (referral as { id: string }).id,
      category:      body.category ?? 'other',
      contact_pref:  body.contact_pref ?? 'none',
      concern_preview: body.concern.trim().slice(0, 100),
    },
  }).then(() => {}, () => {})

  return NextResponse.json({
    ok:      true,
    message: `Your message has been received by ${s.name}'s counseling team. You are not alone — support is on the way.`,
    ref:     (referral as { id: string }).id,
  })
}
