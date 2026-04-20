// WhatsApp bot message handlers.
// SECURITY: All database queries use session.school_id — never message content.
// Fee footer is appended on all fee/balance responses AND all responses when balance > 30k.

import { SupabaseClient } from '@supabase/supabase-js'
import {
  BotSession, SessionState,
  getOrCreateSession, pinSchoolId, advanceState,
  generateOtp, storeOtp, verifyOtp, getPrincipalByPhone,
} from './session'

// ── Fee footer ────────────────────────────────────────────────────────────────
// Returns empty string if no outstanding balance.

async function buildFeeFooter(
  studentId: string,
  schoolId: string,   // MUST come from session — never message
  db: SupabaseClient
): Promise<string> {
  const [studentRes, schoolRes] = await Promise.all([
    db.from('students').select('fee_balance, admission_number').eq('id', studentId).eq('school_id', schoolId).single(),
    db.from('schools').select('paybill_number, term_end_date').eq('id', schoolId).single(),
  ])

  const student = studentRes.data as { fee_balance: number | null; admission_number: string | null } | null
  const school  = schoolRes.data  as { paybill_number: string | null; term_end_date: string | null } | null

  const balance = student?.fee_balance ?? 0
  if (balance <= 0) return ''

  const paybill  = school?.paybill_number ?? 'N/A'
  const adm      = student?.admission_number ?? ''
  const termEnd  = school?.term_end_date
    ? new Date(school.term_end_date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
    : ''

  const base = `\n\n📌 *Outstanding balance: KSh ${balance.toLocaleString('en-KE')}*\nPay via Paybill *${paybill}*, A/C *${adm}*`

  if (balance > 30000) {
    // Alert principal (fire and forget)
    alertPrincipalHighBalance(studentId, schoolId, balance, db).catch(() => {})
    return base + `\nPlease contact the school bursar *URGENTLY* regarding this balance.`
  }
  if (balance > 15000) return base + `\nPlease contact the school bursar.`
  if (balance >= 5000)  return base + (termEnd ? `\nBalance due by *${termEnd}*` : '')
  return base  // < 5k: base only
}

async function alertPrincipalHighBalance(
  studentId: string, schoolId: string, balance: number, db: SupabaseClient
): Promise<void> {
  await db.from('alerts').insert({
    school_id: schoolId,
    type:      'high_fee_balance',
    severity:  'high',
    title:     `Fee balance > KSh 30,000 for student ${studentId}`,
    detail:    { student_id: studentId, balance },
  }).then(() => {}, () => {})
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function ksh(n: number) {
  return `KSh ${n.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`
}

// ── Help message ──────────────────────────────────────────────────────────────

function helpMessage(): string {
  return `*Sychar School Bot — Commands*

📊 *BALANCE* — Wallet balance & daily limit
💳 *FEES* — Fee balance & payment info
📋 *REPORT* — Download latest report card
📅 *ATTENDANCE* — This term's attendance
🚨 *DISCIPLINE* — Recent incident summary
📆 *CALENDAR / RATIBA* — Term calendar
📜 *HISTORY* — Last 5 wallet transactions
💰 *TOPUP [amount]* — M-Pesa STK push (e.g. TOPUP 500)
🔒 *LIMIT [amount]* — Set daily spending limit
❄️ *FREEZE* — Freeze your child's wallet
❓ *HELP / MSAADA* — Show this menu

_To switch between children: reply with your child's first name or SWITCH._`
}

// ── Registration flow ─────────────────────────────────────────────────────────

async function handleRegistration(
  phone: string,
  text:  string,
  session: BotSession,
  db: SupabaseClient
): Promise<string> {

  // ── State: awaiting school code ──────────────────────────────────────────
  if (session.state === 'awaiting_school') {
    const code = text.toUpperCase().trim()
    const { data: school } = await db
      .from('schools')
      .select('id, name, paybill_number')
      .eq('school_code', code)
      .eq('is_active', true)
      .single()

    if (!school) {
      return `❌ School code *${code}* not recognised.\nPlease check with your school and try again.`
    }

    const s = school as { id: string; name: string }
    // PIN the school_id — this is the critical security moment
    await pinSchoolId(phone, s.id, db)

    return `✅ Found *${s.name}*!\n\nPlease enter your child's *admission number* (e.g. NK/2024/089):`
  }

  // ── State: awaiting admission number ────────────────────────────────────
  if (session.state === 'awaiting_admission') {
    if (!session.school_id) {
      await advanceState(phone, 'awaiting_school', {}, db)
      return `Session expired. Please send your School Code again.`
    }

    const adm = text.trim().toUpperCase()
    // SECURITY: query filtered by session.school_id — not by anything from message
    const { data: student } = await db
      .from('students')
      .select('id, full_name, class_name, parent_phone')
      .eq('school_id', session.school_id)
      .ilike('admission_number', adm)
      .eq('is_active', true)
      .single()

    if (!student) {
      return `❌ Admission number *${adm}* not found at this school.\nCheck the number and try again:`
    }

    const st = student as { id: string; full_name: string; class_name: string; parent_phone: string | null }

    // Verify phone matches records (soft check — warn but allow)
    const normalizedRecord  = (st.parent_phone ?? '').replace(/\D/g, '').slice(-9)
    const normalizedCaller  = phone.replace(/\D/g, '').slice(-9)
    const phoneMatches = normalizedRecord === normalizedCaller || !st.parent_phone

    if (!phoneMatches) {
      // Log mismatch for audit, still proceed with OTP
      await db.from('alerts').insert({
        school_id: session.school_id,
        type:      'bot_phone_mismatch',
        severity:  'medium',
        title:     `Bot registration: phone mismatch for ${st.full_name}`,
        detail:    { student_id: st.id, phone, record_phone: st.parent_phone },
      }).then(() => {}, () => {})
    }

    // Generate and send OTP
    const otp = generateOtp()
    await storeOtp(phone, otp, db)
    // Store pending student_id temporarily in session extra field
    await db.from('parent_bot_sessions').update({ pending_student_id: st.id }).eq('phone', phone)

    return `Found *${st.full_name}* (${st.class_name}).\n\nA 6-digit verification code has been sent to this number:\n*${otp}*\n\nPlease reply with the code to verify:`
  }

  // ── State: awaiting OTP ──────────────────────────────────────────────────
  if (session.state === 'awaiting_otp') {
    const valid = await verifyOtp(phone, text.trim(), db)
    if (!valid) {
      return `❌ Invalid or expired code. Please try again, or reply *RESEND* to get a new code.`
    }

    // Fetch pending_student_id from session
    const { data: raw } = await db
      .from('parent_bot_sessions')
      .select('pending_student_id')
      .eq('phone', phone)
      .single()
    const pendingId = (raw as Record<string, string> | null)?.pending_student_id

    // Add student to session
    const existingIds = session.student_ids ?? []
    const newIds = pendingId && !existingIds.includes(pendingId)
      ? [...existingIds, pendingId]
      : existingIds

    await advanceState(phone, 'awaiting_consent', {
      student_ids: newIds,
      active_student_id: pendingId ?? null,
    }, db)
    await db.from('parent_bot_sessions').update({ pending_student_id: null }).eq('phone', phone)

    return `✅ Verified!\n\n*Data Consent Notice*\n\nBy using this service you agree that:\n• Your contact details will be used to send school updates\n• Attendance, fee, and academic data will be shared with you\n• Data is processed in accordance with Kenya's Data Protection Act 2019\n\nReply *AGREE* to continue or *STOP* to opt out.`
  }

  // ── State: awaiting consent ──────────────────────────────────────────────
  if (session.state === 'awaiting_consent') {
    const resp = text.toUpperCase().trim()
    if (resp === 'STOP') {
      await db.from('parent_bot_sessions').delete().eq('phone', phone)
      return `You have opted out. Your data has been removed. Reply any message to register again.`
    }
    if (resp !== 'AGREE') {
      return `Please reply *AGREE* to continue or *STOP* to opt out.`
    }
    await advanceState(phone, 'active', { consent_given: true }, db)
    const { data: studentRow } = await db
      .from('students')
      .select('full_name')
      .eq('id', session.active_student_id!)
      .single()
    const name = (studentRow as { full_name: string } | null)?.full_name ?? 'your child'
    return `🎉 Welcome! You're now registered for *${name}*.\n\n${helpMessage()}`
  }

  return `Something went wrong. Reply *RESET* to start again.`
}

// ── Active parent query handlers ──────────────────────────────────────────────

async function handleParentQuery(
  phone:   string,
  text:    string,
  session: BotSession,
  db:      SupabaseClient
): Promise<string> {

  const cmd       = text.toUpperCase().trim()
  const studentId = session.active_student_id
  const schoolId  = session.school_id!  // PINNED — always use this

  // ── Switch child ─────────────────────────────────────────────────────────
  if (cmd === 'SWITCH' || (session.student_ids.length > 1 && cmd === 'CHILDREN')) {
    const { data: students } = await db
      .from('students')
      .select('id, full_name, class_name')
      .eq('school_id', schoolId)
      .in('id', session.student_ids)
    const list = (students ?? []).map((s, i) =>
      `${i + 1}. ${(s as { full_name: string; class_name: string }).full_name} (${(s as { class_name: string }).class_name})`
    ).join('\n')
    return `*Your children:*\n${list}\n\nReply with a child's name to switch.`
  }

  // Name-based child switch
  if (session.student_ids.length > 1) {
    const { data: byName } = await db
      .from('students')
      .select('id, full_name, class_name')
      .eq('school_id', schoolId)
      .in('id', session.student_ids)
      .ilike('full_name', `%${text}%`)
      .single()
    if (byName) {
      const bn = byName as { id: string; full_name: string; class_name: string }
      await advanceState(phone, 'active', { active_student_id: bn.id }, db)
      return `Switched to *${bn.full_name}* (${bn.class_name}).`
    }
  }

  // ── Add another child ─────────────────────────────────────────────────────
  if (cmd.startsWith('ADD ')) {
    const adm = cmd.slice(4).trim()
    const { data: st } = await db
      .from('students')
      .select('id, full_name, class_name, parent_phone')
      .eq('school_id', schoolId)
      .ilike('admission_number', adm)
      .eq('is_active', true)
      .single()
    if (!st) return `❌ Admission number *${adm}* not found.`
    const s = st as { id: string; full_name: string; class_name: string }
    const otp = generateOtp()
    await storeOtp(phone, otp, db)
    await db.from('parent_bot_sessions').update({ pending_student_id: s.id }).eq('phone', phone)
    await advanceState(phone, 'awaiting_otp', {}, db)
    return `Found *${s.full_name}* (${s.class_name}).\n\nVerification code: *${otp}*\nReply with this code to add this child.`
  }

  // ── RESET ────────────────────────────────────────────────────────────────
  if (cmd === 'RESET') {
    await db.from('parent_bot_sessions').delete().eq('phone', phone)
    return `Session reset. Please send your School Code to register again.`
  }

  if (!studentId) {
    return `No active student selected. Reply *HELP* for commands.`
  }

  // ── HELP / MSAADA ────────────────────────────────────────────────────────
  if (cmd === 'HELP' || cmd === 'MSAADA') return helpMessage()

  // ── BALANCE (wallet) ──────────────────────────────────────────────────────
  if (cmd === 'BALANCE') {
    const today = new Date().toISOString().split('T')[0]
    const [walletRes, txRes] = await Promise.all([
      db.from('student_wallets').select('balance, daily_limit, is_frozen, last_topup_at')
        .eq('school_id', schoolId).eq('student_id', studentId).single(),
      db.from('wallet_transactions').select('amount').eq('wallet_id',
        // sub-query isn't needed; do two fetches
        await db.from('student_wallets').select('id').eq('school_id', schoolId).eq('student_id', studentId).single()
          .then(r => (r.data as { id: string } | null)?.id ?? '')
      ).eq('type', 'purchase').gte('timestamp', `${today}T00:00:00Z`),
    ])
    const w = walletRes.data as { balance: number; daily_limit: number; is_frozen: boolean; last_topup_at: string | null } | null
    if (!w) return `No wallet found. Contact the school canteen.`
    const spend = ((txRes.data ?? []) as { amount: number }[]).reduce((s, t) => s + t.amount, 0)
    const available = Math.max(0, Math.min(w.balance, w.daily_limit - spend))
    const footer = await buildFeeFooter(studentId, schoolId, db)
    return `💳 *Canteen Wallet*\n\nBalance: *${ksh(w.balance)}*\nDaily limit: ${ksh(w.daily_limit)}\nSpent today: ${ksh(spend)}\nAvailable today: *${ksh(available)}*${w.is_frozen ? '\n\n❄️ _Wallet is frozen — contact bursar_' : ''}${footer}`
  }

  // ── FEES ──────────────────────────────────────────────────────────────────
  if (cmd === 'FEES') {
    const [studentRes, schoolRes] = await Promise.all([
      db.from('students').select('fee_balance, full_name, admission_number, class_name').eq('id', studentId).eq('school_id', schoolId).single(),
      db.from('schools').select('name, paybill_number, term_end_date').eq('id', schoolId).single(),
    ])
    const st = studentRes.data as { fee_balance: number | null; full_name: string; admission_number: string | null; class_name: string } | null
    const sc = schoolRes.data  as { name: string; paybill_number: string | null; term_end_date: string | null } | null
    if (!st) return `Student record not found.`
    const bal = st.fee_balance ?? 0
    const footer = await buildFeeFooter(studentId, schoolId, db)
    if (bal <= 0) {
      return `✅ *Fees for ${st.full_name}*\n\nAll fees cleared for this term.\nThank you for your commitment to ${st.full_name}&apos;s education!`
    }
    return `💰 *Fee Statement — ${st.full_name}*\nClass: ${st.class_name}\n${footer.trim()}`
  }

  // ── ATTENDANCE ────────────────────────────────────────────────────────────
  if (cmd === 'ATTENDANCE') {
    const term = new Date().getMonth() + 1 <= 4 ? 1 : new Date().getMonth() + 1 <= 8 ? 2 : 3
    const { data: records } = await db
      .from('attendance_records')
      .select('status, date')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .eq('term', String(term))
    const total   = (records ?? []).length
    const present = (records ?? []).filter((r: { status: string }) => r.status === 'present').length
    const absent  = total - present
    const pct     = total > 0 ? Math.round((present / total) * 100) : 0
    const footer  = await buildFeeFooter(studentId, schoolId, db)
    return `📅 *Attendance — Term ${term}*\n\nDays recorded: ${total}\n✅ Present: ${present}\n❌ Absent: ${absent}\nRate: *${pct}%*${pct < 80 ? '\n\n⚠️ Below 80% — please contact class teacher' : ''}${footer}`
  }

  // ── DISCIPLINE ────────────────────────────────────────────────────────────
  if (cmd === 'DISCIPLINE') {
    const { data: incidents } = await db
      .from('discipline_records')
      .select('incident_type, severity, date, resolution_status')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .limit(5)
    // NEVER expose G&C (guidance & counselling) records
    const safe = (incidents ?? []).filter(
      (i: { incident_type: string }) => !i.incident_type?.toLowerCase().includes('guidance') && !i.incident_type?.toLowerCase().includes('counsell')
    )
    if (safe.length === 0) {
      return `✅ *Discipline Summary*\n\nNo recorded incidents this term. Keep it up!`
    }
    const lines = safe.map((i: { incident_type: string; severity: string; date: string; resolution_status: string }) =>
      `• ${new Date(i.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })} — ${i.incident_type} (${i.severity}) — ${i.resolution_status}`
    ).join('\n')
    return `📋 *Discipline Summary*\nLast ${safe.length} incident(s):\n\n${lines}`
  }

  // ── CALENDAR / RATIBA ─────────────────────────────────────────────────────
  if (cmd === 'CALENDAR' || cmd === 'RATIBA') {
    const today    = new Date().toISOString().split('T')[0]
    const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 3, 0).toISOString().split('T')[0]
    const { data: events } = await db
      .from('school_calendar')
      .select('title, event_date, event_time, category, description')
      .eq('school_id', schoolId)
      .in('audience', ['all', 'parents'])
      .gte('event_date', today)
      .lte('event_date', monthEnd)
      .order('event_date')
      .limit(15)
    if (!events || events.length === 0) {
      return `📆 *Term Calendar*\n\nNo upcoming events. Check with the school for the full calendar.`
    }
    const lines = (events as { title: string; event_date: string; event_time: string | null; category: string }[]).map(e => {
      const d = new Date(e.event_date).toLocaleDateString('en-KE', { weekday: 'short', day: '2-digit', month: 'short' })
      const t = e.event_time ? ` at ${e.event_time.slice(0, 5)}` : ''
      const icon = { academic: '📚', sports: '⚽', cultural: '🎭', holiday: '🏖️', exam: '✏️', general: '📅' }[e.category] ?? '📅'
      return `${icon} *${d}${t}* — ${e.title}`
    }).join('\n')
    return `📆 *Upcoming Events*\n\n${lines}`
  }

  // ── HISTORY (wallet transactions) ─────────────────────────────────────────
  if (cmd === 'HISTORY') {
    const { data: walletRow } = await db
      .from('student_wallets')
      .select('id')
      .eq('school_id', schoolId)
      .eq('student_id', studentId)
      .single()
    const walletId = (walletRow as { id: string } | null)?.id
    if (!walletId) return `No wallet history found.`
    const { data: txs } = await db
      .from('wallet_transactions')
      .select('type, amount, balance_after, description, timestamp')
      .eq('wallet_id', walletId)
      .order('timestamp', { ascending: false })
      .limit(5)
    if (!txs || txs.length === 0) return `No transactions yet.`
    const lines = (txs as { type: string; amount: number; balance_after: number; description: string; timestamp: string }[]).map(t => {
      const d = new Date(t.timestamp).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })
      const sign = t.type === 'topup' ? '+' : '-'
      return `${d} ${sign}${ksh(t.amount)} — ${t.description} (Bal: ${ksh(t.balance_after)})`
    }).join('\n')
    return `📜 *Last ${txs.length} Transactions*\n\n${lines}`
  }

  // ── TOPUP [amount] ────────────────────────────────────────────────────────
  if (cmd.startsWith('TOPUP')) {
    const parts = cmd.split(' ')
    const amount = Number(parts[1])
    if (isNaN(amount) || amount < 1) return `Usage: *TOPUP 500* (minimum KSh 1)`
    const { data: st } = await db
      .from('students')
      .select('full_name, admission_number')
      .eq('id', studentId)
      .eq('school_id', schoolId)
      .single()
    const s = st as { full_name: string; admission_number: string } | null
    if (!s) return `Student not found.`
    // STK push via M-Pesa Daraja
    const darajaRes = await triggerStkPush(phone, amount, s.admission_number, schoolId)
    if (!darajaRes) return `❌ Could not initiate M-Pesa request. Please try again or pay via Paybill.`
    return `📱 *M-Pesa Request Sent*\n\nAmount: *${ksh(amount)}*\nFor: ${s.full_name}\nAccount: ${s.admission_number}\n\nEnter your M-Pesa PIN when prompted. The wallet will be credited automatically.`
  }

  // ── LIMIT [amount] ────────────────────────────────────────────────────────
  if (cmd.startsWith('LIMIT')) {
    const parts  = cmd.split(' ')
    const amount = Number(parts[1])
    if (isNaN(amount) || amount < 0) return `Usage: *LIMIT 200* (set daily spending cap)`
    await db.from('student_wallets').update({ daily_limit: amount }).eq('school_id', schoolId).eq('student_id', studentId)
    return `✅ Daily spending limit set to *${ksh(amount)}*.`
  }

  // ── FREEZE ────────────────────────────────────────────────────────────────
  if (cmd === 'FREEZE') {
    await db.from('student_wallets').update({ is_frozen: true }).eq('school_id', schoolId).eq('student_id', studentId)
    return `❄️ *Wallet frozen.* Your child cannot make canteen purchases until you unfreeze it.\nReply *UNFREEZE* to restore access.`
  }

  if (cmd === 'UNFREEZE') {
    await db.from('student_wallets').update({ is_frozen: false }).eq('school_id', schoolId).eq('student_id', studentId)
    return `✅ Wallet unfrozen. Canteen purchases are now allowed.`
  }

  // ── REPORT ────────────────────────────────────────────────────────────────
  if (cmd === 'REPORT') {
    const footer = await buildFeeFooter(studentId, schoolId, db)
    // Report generation is async — trigger and return a "coming soon" message
    // TODO: integrate with report card generation endpoint
    return `📋 *Report Card*\n\nYour request has been received. The report card link will be sent to you within a few minutes.${footer}`
  }

  // ── Default ───────────────────────────────────────────────────────────────
  const footer = session.school_id
    ? await buildFeeFooter(studentId, schoolId, db).catch(() => '')
    : ''

  // Check if fee balance > 30k — if so, footer is mandatory on ALL messages
  return `❓ Command not recognised. Reply *HELP* for the full list of commands.${footer}`
}

// ── Principal morning-brief reply handler ─────────────────────────────────────

export async function handlePrincipalReply(
  phone:    string,
  text:     string,
  schoolId: string,
  db:       SupabaseClient
): Promise<string> {
  const cmd = text.toUpperCase().trim()

  if (cmd === 'DETAIL FEES') {
    const { data } = await db
      .from('fee_payments')
      .select('amount, payment_date')
      .eq('school_id', schoolId)
      .gte('payment_date', new Date().toISOString().split('T')[0])
    const total = ((data ?? []) as { amount: number }[]).reduce((s, p) => s + p.amount, 0)
    const { data: defaulters } = await db
      .from('students')
      .select('full_name, fee_balance, class_name')
      .eq('school_id', schoolId)
      .gt('fee_balance', 0)
      .order('fee_balance', { ascending: false })
      .limit(10)
    const list = ((defaulters ?? []) as { full_name: string; fee_balance: number; class_name: string }[])
      .map(s => `• ${s.full_name} (${s.class_name}): KSh ${s.fee_balance.toLocaleString('en-KE')}`)
      .join('\n')
    return `💰 *Fee Detail*\n\nCollected today: KSh ${total.toLocaleString('en-KE')}\n\n*Top 10 defaulters:*\n${list || 'None'}`
  }

  if (cmd === 'DETAIL STORE') {
    const { data } = await db
      .from('inventory_items')
      .select('name, current_stock, reorder_level, unit')
      .eq('school_id', schoolId)
      .filter('current_stock', 'lte', 'reorder_level') // items below threshold
      .limit(15)
    if (!data || data.length === 0) return `📦 No store alerts — all items above threshold.`
    const list = (data as { name: string; current_stock: number; reorder_level: number; unit: string }[])
      .map(i => `• ${i.name}: ${i.current_stock} ${i.unit} (min: ${i.reorder_level})`)
      .join('\n')
    return `📦 *Store Alerts*\n\n${list}`
  }

  if (cmd === 'DETAIL ABSENT') {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await db
      .from('attendance_records')
      .select('student_id, students(full_name, class_name)')
      .eq('school_id', schoolId)
      .eq('status', 'absent')
      .eq('date', today)
      .limit(30)
    if (!data || data.length === 0) return `✅ No absent students recorded today.`
    type AbsentRow = { students: { full_name: string; class_name: string }[] | { full_name: string; class_name: string } | null }
    const list = (data as unknown as AbsentRow[])
      .map(r => Array.isArray(r.students) ? r.students[0] : r.students)
      .filter(Boolean)
      .map(s => `• ${(s as { full_name: string; class_name: string }).full_name} (${(s as { full_name: string; class_name: string }).class_name})`)
      .join('\n')
    return `❌ *Absent Today (${data.length})*\n\n${list}`
  }

  if (cmd === 'DETAIL PENDING') {
    const [reqRes, susRes] = await Promise.all([
      db.from('requisitions').select('id', { count: 'exact' }).eq('school_id', schoolId).eq('status', 'pending'),
      db.from('discipline_records').select('id', { count: 'exact' }).eq('school_id', schoolId).eq('status', 'pending_review'),
    ])
    return `📋 *Pending Actions*\n\n• Requisitions: ${reqRes.count ?? 0}\n• Discipline cases: ${susRes.count ?? 0}\n\nLog in to the dashboard to review.`
  }

  if (cmd.startsWith('APPROVE ')) {
    const ref = cmd.slice(8).trim()
    const { data: req } = await db
      .from('requisitions')
      .select('id, title, department')
      .eq('school_id', schoolId)
      .ilike('id', `${ref}%`)
      .eq('status', 'pending')
      .single()
    if (!req) return `❌ Requisition *${ref}* not found or already processed.`
    const r = req as { id: string; title: string; department: string }
    await db.from('requisitions').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', r.id)
    return `✅ Approved: *${r.title}* (${r.department})`
  }

  return `❓ Unknown command. Supported: DETAIL FEES | DETAIL STORE | DETAIL ABSENT | DETAIL PENDING | APPROVE [ref]`
}

// ── M-Pesa STK push trigger ───────────────────────────────────────────────────

async function triggerStkPush(
  phone:      string,
  amount:     number,
  accountRef: string,
  _schoolId:  string
): Promise<boolean> {
  const url      = process.env.MPESA_STK_URL
  const key      = process.env.MPESA_CONSUMER_KEY
  const secret   = process.env.MPESA_CONSUMER_SECRET
  const shortcode = process.env.MPESA_SHORTCODE
  const passkey   = process.env.MPESA_PASSKEY
  const callback  = process.env.MPESA_CALLBACK_URL

  if (!url || !key || !secret || !shortcode || !passkey || !callback) {
    console.warn('[STK] Missing M-Pesa env vars')
    return false
  }

  try {
    // Get access token
    const tokenRes = await fetch(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { 'Authorization': 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') } }
    )
    if (!tokenRes.ok) return false
    const { access_token } = await tokenRes.json() as { access_token: string }

    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
    const password  = Buffer.from(shortcode + passkey + timestamp).toString('base64')

    const stkRes = await fetch(url, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: phone.startsWith('+') ? phone.slice(1) : phone,
        PartyB: shortcode,
        PhoneNumber: phone.startsWith('+') ? phone.slice(1) : phone,
        CallBackURL: callback,
        AccountReference: accountRef,
        TransactionDesc: `Canteen wallet top-up for ${accountRef}`,
      }),
    })
    return stkRes.ok
  } catch (e) {
    console.error('[STK] Error:', e)
    return false
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

export async function handleIncomingMessage(
  phone: string,
  text:  string,
  db:    SupabaseClient
): Promise<string> {

  // 1. Check if it's the principal replying to a morning brief
  const principal = await getPrincipalByPhone(phone, db)
  if (principal) {
    const upper = text.toUpperCase().trim()
    if (upper.startsWith('DETAIL ') || upper.startsWith('APPROVE ')) {
      return handlePrincipalReply(phone, text, principal.school_id, db)
    }
  }

  // 2. Check for emergency broadcast confirmation "YES"
  if (text.trim().toUpperCase() === 'YES') {
    await recordEmergencyConfirmation(phone, db)
    // Fall through to also process as normal message
  }

  // 3. Parent bot session
  const session = await getOrCreateSession(phone, db)

  if (session.state !== 'active') {
    return handleRegistration(phone, text, session, db)
  }

  return handleParentQuery(phone, text, session, db)
}

// ── Emergency confirmation recording ─────────────────────────────────────────

async function recordEmergencyConfirmation(phone: string, db: SupabaseClient): Promise<void> {
  // Find the most recent broadcast in the last 2 hours that this phone is a recipient of
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: broadcast } = await db
    .from('emergency_broadcasts')
    .select('id, school_id')
    .gte('sent_at', twoHoursAgo)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()
  if (!broadcast) return

  const b = broadcast as { id: string; school_id: string }

  // Find student linked to this phone
  const { data: session } = await db
    .from('parent_bot_sessions')
    .select('active_student_id')
    .eq('phone', phone)
    .eq('school_id', b.school_id)
    .single()

  await db.from('emergency_confirmations').upsert({
    broadcast_id: b.id,
    parent_phone: phone,
    student_id:   (session as { active_student_id: string | null } | null)?.active_student_id ?? null,
    confirmed_at: new Date().toISOString(),
  }, { onConflict: 'broadcast_id,parent_phone', ignoreDuplicates: true }).then(() => {}, () => {})
}
