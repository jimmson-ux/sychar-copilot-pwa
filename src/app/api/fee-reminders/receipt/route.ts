// POST /api/fee-reminders/receipt
// Called after a fee payment is recorded (by M-Pesa callback or manual entry).
// Sends WhatsApp receipt to parent within 30 seconds.
// Body: { student_id, amount, receipt_number, payment_method, balance_after, school_id }
// Auth: service role or internal cron — protected by INTERNAL_API_SECRET header.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsApp } from '@/lib/whatsapp'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db   = svc()
  const body = await req.json() as {
    student_id:     string
    school_id:      string
    amount:         number
    receipt_number: string | null
    payment_method: string | null
    balance_after:  number | null
  }

  if (!body.student_id || !body.school_id || !body.amount) {
    return NextResponse.json({ error: 'student_id, school_id, amount required' }, { status: 400 })
  }

  // Fetch student details
  const { data: student } = await db
    .from('students')
    .select('full_name, admission_number, class_name, fee_balance')
    .eq('id', body.student_id)
    .eq('school_id', body.school_id)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const st = student as { full_name: string; admission_number: string | null; class_name: string; fee_balance: number | null }

  // Fetch school details
  const { data: school } = await db
    .from('schools')
    .select('name, paybill_number')
    .eq('id', body.school_id)
    .single()
  const sc = school as { name: string; paybill_number: string | null } | null

  // Find parent's registered phone (session pinned to this school_id)
  const { data: session } = await db
    .from('parent_bot_sessions')
    .select('phone')
    .eq('school_id', body.school_id)
    .eq('active_student_id', body.student_id)
    .eq('state', 'active')
    .eq('consent_given', true)
    .single()

  if (!session) {
    return NextResponse.json({ ok: false, reason: 'No registered parent session for this student' })
  }

  const phone = (session as { phone: string }).phone

  const ksh = (n: number) => `KSh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
  const now  = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })

  const outstandingBalance = body.balance_after ?? st.fee_balance ?? 0

  let message = `✅ *Fee Payment Received*\n\n`
  message += `School: *${sc?.name ?? 'School'}*\n`
  message += `Student: *${st.full_name}* (${st.class_name})\n`
  message += `Admission: ${st.admission_number ?? 'N/A'}\n`
  message += `\n💰 Amount Paid: *${ksh(body.amount)}*\n`
  message += `Date: ${now}\n`
  if (body.receipt_number) message += `Receipt #: *${body.receipt_number}*\n`
  if (body.payment_method) message += `Method: ${body.payment_method}\n`

  if (outstandingBalance > 0) {
    message += `\n📌 Remaining balance: *${ksh(outstandingBalance)}*\n`
    if (sc?.paybill_number && st.admission_number) {
      message += `Pay via Paybill *${sc.paybill_number}*, A/C *${st.admission_number}*`
    }
  } else {
    message += `\n✅ All fees cleared! Thank you. 🙏`
  }

  const ok = await sendWhatsApp(phone, message)

  return NextResponse.json({ ok, phone: ok ? phone : undefined })
}
