// GET  /api/whatsapp — Meta webhook verification
// POST /api/whatsapp — Incoming message handler with Claude intent detection

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SCHOOL_ID  = process.env.NEXT_PUBLIC_SCHOOL_ID!
const BASE_URL   = process.env.NEXT_PUBLIC_APP_URL   ?? 'https://project-o7htk.vercel.app'
const WA_TOKEN   = process.env.WHATSAPP_API_TOKEN
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? 'sychar_webhook_secret'

// ── Supabase client ──────────────────────────────────────────────────────────
let _sb: SupabaseClient | null = null
function getSb(): SupabaseClient {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _sb
}

// ── WhatsApp send helper ─────────────────────────────────────────────────────
async function sendWA(to: string, body: string): Promise<string | null> {
  if (!WA_TOKEN || !WA_PHONE_ID) return null
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    })
    if (!res.ok) return null
    const d = await res.json() as { messages?: { id: string }[] }
    return d.messages?.[0]?.id ?? null
  } catch {
    return null
  }
}

// ── Log helper ───────────────────────────────────────────────────────────────
async function logSms(opts: {
  direction: 'inbound' | 'outbound'
  phone: string
  message?: string
  intent?: string
  studentId?: string
  waMessageId?: string
}) {
  await getSb().from('sms_log').insert({
    school_id:    SCHOOL_ID,
    direction:    opts.direction,
    phone:        opts.phone,
    message:      opts.message,
    intent:       opts.intent,
    student_id:   opts.studentId ?? null,
    wa_message_id: opts.waMessageId ?? null,
  })
}

// ── Intent detection via Claude ──────────────────────────────────────────────
type Intent =
  | 'greeting'
  | 'fee_query'
  | 'results_query'
  | 'attendance_query'
  | 'kcse_query'
  | 'duty_query'
  | 'send_my_link'
  | 'principal_broadcast'
  | 'unknown'

async function detectIntent(message: string): Promise<Intent> {
  try {
    const client = new Anthropic()
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: `Classify this WhatsApp message into exactly ONE of these intents:
greeting, fee_query, results_query, attendance_query, kcse_query, duty_query, send_my_link, principal_broadcast, unknown

Rules:
- fee_query: asking about fees, balance, payment, receipt
- results_query: asking about exam results, marks, grades
- attendance_query: asking about attendance, absence, present days
- kcse_query: asking about KCSE registration, mock results, KNEC
- duty_query: asking about teacher duty schedule, staffroom duty
- send_my_link: teacher asking for their portal link / magic link
- principal_broadcast: message starting with /broadcast (principal only)
- greeting: hello, habari, hi, hujambo, assalam, good morning/afternoon/evening
- unknown: anything else

Message: "${message.replace(/"/g, "'").slice(0, 300)}"

Reply with ONLY the intent word, nothing else.`,
      }],
    })
    const text = (res.content[0] as { type: string; text: string }).text?.trim().toLowerCase() as Intent
    const valid: Intent[] = ['greeting','fee_query','results_query','attendance_query','kcse_query','duty_query','send_my_link','principal_broadcast','unknown']
    return valid.includes(text) ? text : 'unknown'
  } catch {
    return 'unknown'
  }
}

// ── Parent lookup by phone ───────────────────────────────────────────────────
async function lookupParent(phone: string) {
  const digits = phone.replace(/\D/g, '').slice(-9)
  const { data } = await getSb()
    .from('students')
    .select('id, full_name, admission_number, class_name, form_level, parent_phone')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)
    .or(`parent_phone.ilike.%${digits},parent_phone2.ilike.%${digits}`)
    .limit(1)
    .single()
  return data ?? null
}

// ── Staff lookup by phone ────────────────────────────────────────────────────
async function lookupStaff(phone: string) {
  const digits = phone.replace(/\D/g, '').slice(-9)
  const { data } = await getSb()
    .from('staff_records')
    .select('id, full_name, sub_role, subject_specialization, assigned_class_name')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)
    .ilike('phone', `%${digits}`)
    .limit(1)
    .single()
  return data ?? null
}

// ── Intent handlers ──────────────────────────────────────────────────────────

async function handleGreeting(phone: string) {
  const parent = await lookupParent(phone)
  if (parent) {
    return `Karibu! Mimi ni msaidizi wa Sychar wa ${parent.class_name ?? 'shule'}. Unaweza kuniuliza kuhusu ada, matokeo, au mahudhurio ya ${parent.full_name}. ✅`
  }
  return `Karibu! Mimi ni msaidizi wa Sychar. Kwa taarifa za ada, matokeo au mahudhurio, wasiliana na ofisi ya shule. 📚`
}

async function handleFeeQuery(phone: string, studentId?: string) {
  const student = studentId
    ? (await getSb().from('students').select('id, full_name, class_name').eq('id', studentId).single()).data
    : await lookupParent(phone)

  if (!student) {
    return `Samahani, sijakupata katika mfumo wetu. Tafadhali wasiliana na ofisi ya shule kwa nambari yako ya kumbukumbu. 🏫`
  }
  return `Habari! Kwa taarifa za ada za ${student.full_name} (${student.class_name ?? ''}), tafadhali tembelea ofisi ya shule au piga simu moja kwa moja. Tumesalimisha taarifa hizi kwa usalama. 🔒`
}

async function handleResultsQuery(phone: string) {
  const parent = await lookupParent(phone)
  if (!parent) {
    return `Samahani, sijakupata katika mfumo. Wasiliana na mwalimu wa darasa kwa matokeo ya mtoto wako. 📋`
  }
  return `Matokeo ya ${parent.full_name} (${parent.class_name ?? ''}) yatapatikana baada ya mwalimu kuyapakia. Utaarifiwa hapa WhatsApp ukisha. 📊`
}

async function handleAttendanceQuery(phone: string) {
  const parent = await lookupParent(phone)
  if (!parent) {
    return `Samahani, sijakupata katika mfumo. Wasiliana na ofisi ya shule kwa taarifa za mahudhurio. 📋`
  }
  return `Kwa taarifa za mahudhurio za ${parent.full_name}, wasiliana na mwalimu wa darasa moja kwa moja. Taarifa za kina zinapatikana ofisini. 🏫`
}

async function handleKcseQuery(phone: string) {
  const parent = await lookupParent(phone)
  const name = parent ? `ya ${parent.full_name} ` : ''
  return `Taarifa za KCSE ${name}zinasimamiwa na KNEC. Kwa maswali ya usajili au matokeo, wasiliana na ofisi ya shule. 📝`
}

async function handleDutyQuery(phone: string) {
  const staff = await lookupStaff(phone)
  if (!staff) {
    return `Samahani, sijakupata kama mwafanyikazi wa shule. Angalia ratiba yako ya zamu kwenye ubao wa matangazo. 📋`
  }
  return `Habari ${staff.full_name}! Angalia ratiba ya zamu kwenye mfumo wa shule au wasiliana na HOD wako. 📅`
}

async function handleSendMyLink(phone: string) {
  const staff = await lookupStaff(phone)
  if (!staff) {
    return `Samahani, sijakupata kama mwafanyikazi wa shule. Wasiliana na ofisi kwa msaada. 🏫`
  }

  const { randomBytes } = await import('crypto')
  const token = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()

  await getSb().from('teacher_tokens').insert({
    token,
    teacher_id:   staff.id,
    school_id:    SCHOOL_ID,
    subject_name: staff.subject_specialization,
    class_name:   staff.assigned_class_name,
    expires_at:   expiresAt,
    is_active:    true,
    sent_via:     'whatsapp',
  })

  const link = `${BASE_URL}/record?token=${token}`
  return `Habari ${staff.full_name}! Hii ni kiungo chako cha kurekodi kazi ya leo:\n\n${link}\n\n_(Kitaisha baada ya masaa 8)_ ✅`
}

async function handlePrincipalBroadcast(phone: string, message: string) {
  const staff = await lookupStaff(phone)
  if (!staff || !['principal', 'hod_pathways'].includes(staff.sub_role ?? '')) {
    return `Samahani, huduma hii ni kwa mkurugenzi tu. 🔒`
  }

  // Strip /broadcast prefix
  const broadcastMsg = message.replace(/^\/broadcast\s*/i, '').trim()
  if (!broadcastMsg) {
    return `Tuma ujumbe baada ya /broadcast. Mfano: /broadcast Mkutano wa wazazi Ijumaa saa 3 asubuhi.`
  }

  // Fetch all parent phones
  const { data: students } = await getSb()
    .from('students')
    .select('parent_phone, parent_phone2')
    .eq('school_id', SCHOOL_ID)
    .eq('is_active', true)

  const phones = new Set<string>()
  for (const s of students ?? []) {
    if (s.parent_phone) phones.add(s.parent_phone.replace(/\D/g, '').slice(-9))
    if (s.parent_phone2) phones.add(s.parent_phone2.replace(/\D/g, '').slice(-9))
  }

  let sent = 0
  for (const p of phones) {
    const id = await sendWA(`254${p}`, `📢 *Taarifa kutoka shule:*\n\n${broadcastMsg}`)
    if (id) {
      sent++
      await logSms({ direction: 'outbound', phone: `254${p}`, message: broadcastMsg, intent: 'principal_broadcast', waMessageId: id })
    }
  }

  return `Ujumbe umetumwa kwa wazazi ${sent}. ✅`
}

// ── GET — webhook verification ───────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// ── POST — incoming messages ─────────────────────────────────────────────────
export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = body as {
    object?: string
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id: string
            from: string
            type: string
            text?: { body: string }
            timestamp: string
          }>
        }
      }>
    }>
  }

  if (payload.object !== 'whatsapp_business_account') {
    return NextResponse.json({ received: true })
  }

  const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages ?? []

  for (const msg of messages) {
    if (msg.type !== 'text') continue
    const from    = msg.from
    const text    = msg.text?.body ?? ''
    const waId    = msg.id

    // Log inbound
    await logSms({ direction: 'inbound', phone: from, message: text, waMessageId: waId })

    // Check bot enabled
    const { data: settings } = await getSb()
      .from('school_settings')
      .select('whatsapp_bot_enabled')
      .eq('school_id', SCHOOL_ID)
      .single()

    if (settings?.whatsapp_bot_enabled === false) continue

    const intent = await detectIntent(text)

    // Log intent on same record (update the last inbound)
    await getSb()
      .from('sms_log')
      .update({ intent })
      .eq('wa_message_id', waId)

    let reply = ''
    switch (intent) {
      case 'greeting':           reply = await handleGreeting(from);                     break
      case 'fee_query':          reply = await handleFeeQuery(from);                      break
      case 'results_query':      reply = await handleResultsQuery(from);                  break
      case 'attendance_query':   reply = await handleAttendanceQuery(from);               break
      case 'kcse_query':         reply = await handleKcseQuery(from);                     break
      case 'duty_query':         reply = await handleDutyQuery(from);                     break
      case 'send_my_link':       reply = await handleSendMyLink(from);                    break
      case 'principal_broadcast': reply = await handlePrincipalBroadcast(from, text);    break
      default:
        reply = `Samahani, sijapata swali lako. Unaweza kuuliza kuhusu:\n• Ada 💰\n• Matokeo 📊\n• Mahudhurio 📋\n• KCSE 📝\n\nKwa msaada zaidi, piga simu ofisi ya shule. 📞`
    }

    if (reply) {
      const outId = await sendWA(from, reply)
      await logSms({ direction: 'outbound', phone: from, message: reply, intent, waMessageId: outId ?? undefined })
    }
  }

  return NextResponse.json({ received: true })
}
