// Edge function: morning-brief
// Runs at 07:30 EAT on weekdays (cron: 30 4 * * 1-5 UTC).
// For each active school: gathers data, asks Claude to write the brief, sends via AT SMS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY    = Deno.env.get('ANTHROPIC_API_KEY')!
const AT_API_KEY           = Deno.env.get('AT_API_KEY')!
const AT_USERNAME          = Deno.env.get('AT_USERNAME') ?? 'sandbox'
const AT_SENDER_ID         = Deno.env.get('AT_SENDER_ID') ?? ''

async function sendSMS(to: string, message: string): Promise<void> {
  const params = new URLSearchParams({ username: AT_USERNAME, to, message })
  if (AT_SENDER_ID) params.set('from', AT_SENDER_ID)
  await fetch('https://api.africastalking.com/version1/messaging', {
    method:  'POST',
    headers: { 'ApiKey': AT_API_KEY, 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body:    params.toString(),
  }).catch(() => {})
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false }), { status: 405 })
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { data: schools } = await db
    .from('schools')
    .select('id, name')
    .eq('is_active', true)

  if (!schools?.length) {
    return new Response(JSON.stringify({ ok: true, schools: 0 }), { status: 200 })
  }

  const nairobi    = new Date().toLocaleString('en-US', { timeZone: 'Africa/Nairobi' })
  const todayDate  = new Date(nairobi)
  const todayISO   = todayDate.toISOString().split('T')[0]
  const yesterday  = new Date(todayDate)
  yesterday.setDate(yesterday.getDate() - 1)
  const yestISO    = yesterday.toISOString().split('T')[0]

  const results: { school: string; ok: boolean; error?: string }[] = []

  for (const school of schools as { id: string; name: string }[]) {
    try {
      const schoolId = school.id

      // ── 1. Principal phone + name ──────────────────────────────────────────
      const [settingsRes, principalRes] = await Promise.all([
        db.from('school_settings')
          .select('principal_phone, current_term, current_academic_year')
          .eq('school_id', schoolId)
          .maybeSingle(),
        db.from('staff_records')
          .select('full_name, phone')
          .eq('school_id', schoolId)
          .eq('sub_role', 'principal')
          .maybeSingle(),
      ])

      const principalPhone = (settingsRes.data as { principal_phone?: string | null } | null)?.principal_phone
        ?? (principalRes.data as { phone?: string | null } | null)?.phone

      if (!principalPhone) {
        results.push({ school: school.name, ok: false, error: 'No principal phone' })
        continue
      }
      const principalName = (principalRes.data as { full_name?: string } | null)?.full_name ?? 'Principal'

      // ── 2. Gather data in parallel ─────────────────────────────────────────
      const [
        attendanceRes,
        clinicRes,
        disciplineRes,
        complianceRes,
        feesRes,
        pendingReqRes,
        todDutyRes,
        functionsRes,
      ] = await Promise.all([
        // Yesterday student attendance
        db.from('student_attendance')
          .select('status')
          .eq('school_id', schoolId)
          .eq('date', yestISO),

        // Yesterday clinic visits
        db.from('clinic_visits')
          .select('id')
          .eq('school_id', schoolId)
          .gte('visited_at', `${yestISO}T00:00:00`)
          .lt('visited_at', `${todayISO}T00:00:00`),

        // Unresolved critical discipline
        db.from('discipline_records')
          .select('id, severity')
          .eq('school_id', schoolId)
          .eq('severity', 'critical')
          .neq('status', 'resolved'),

        // Red zone compliance
        db.from('compliance_tracking')
          .select('staff_id, score')
          .eq('school_id', schoolId)
          .lt('score', 50),

        // Fees collected yesterday
        db.from('fee_records')
          .select('amount')
          .eq('school_id', schoolId)
          .gte('created_at', `${yestISO}T00:00:00`)
          .lt('created_at', `${todayISO}T00:00:00`),

        // Pending requisitions
        db.from('requisitions')
          .select('id')
          .eq('school_id', schoolId)
          .eq('status', 'pending'),

        // Today's TOD duty
        db.from('duty_assignments')
          .select('staff_records!staff_id(full_name)')
          .eq('school_id', schoolId)
          .eq('duty_date', todayISO),

        // Today's school functions/events
        db.from('notices')
          .select('title')
          .eq('school_id', schoolId)
          .eq('target_audience', 'all')
          .gte('created_at', `${todayISO}T00:00:00`),
      ])

      // ── 3. Compute metrics ─────────────────────────────────────────────────
      const attendance     = attendanceRes.data ?? []
      const present        = attendance.filter((a: { status: string }) => a.status === 'present').length
      const total          = attendance.length
      const attendanceRate = total > 0 ? Math.round((present / total) * 100) : null

      const clinicCount     = clinicRes.data?.length ?? 0
      const criticalCases   = disciplineRes.data?.length ?? 0
      const redZoneTeachers = complianceRes.data?.length ?? 0

      const feeRecs      = feesRes.data ?? []
      const feeTotal     = (feeRecs as { amount: number }[]).reduce((s, r) => s + (r.amount ?? 0), 0)
      const pendingCount = pendingReqRes.data?.length ?? 0

      type DutyRow = { staff_records: { full_name: string } | null }
      const todNames = (todDutyRes.data ?? [])
        .map((d: DutyRow) => d.staff_records?.full_name ?? '')
        .filter(Boolean)
        .join(', ') || 'None assigned'

      const todayFunctions = (functionsRes.data ?? [])
        .map((n: { title: string }) => n.title)
        .join(', ') || 'None'

      // ── 4. Build Claude prompt ─────────────────────────────────────────────
      const dateLabel = todayDate.toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      const dataContext = JSON.stringify({
        school: school.name,
        date: dateLabel,
        principal: principalName,
        attendance: attendanceRate !== null ? `${attendanceRate}% (${present} present of ${total})` : 'No data',
        clinicVisitsYesterday: clinicCount,
        criticalDisciplineCases: criticalCases,
        redZoneComplianceTeachers: redZoneTeachers,
        feesCollectedYesterday: `KES ${feeTotal.toLocaleString()}`,
        pendingApprovals: pendingCount,
        todOfficerToday: todNames,
        schoolFunctionsToday: todayFunctions,
      })

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: JSON.stringify({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: 'You are a school management AI assistant. Generate a concise morning brief for a Kenyan secondary school principal. Use the exact format specified. Be direct, specific, and actionable.',
          messages: [{
            role: 'user',
            content: `Generate a morning brief from this school data. Use this exact format:

"Good morning [Principal Name]. Here is your school snapshot for [date]:

📊 ATTENDANCE: [X]% yesterday ([Y] absent). [Flag if below 80%]
👨‍🏫 STAFF: [X] teachers on TOD duty today. [Any absences flagged]
🏥 HEALTH: [X] clinic visits yesterday.
📋 PENDING: [X] approvals need your attention.
💰 FEES: KES [X] collected yesterday.
⚠️ DISCIPLINE: [X] critical cases unresolved.
📚 COMPLIANCE: [X] teachers in red zone.
🎯 TODAY: [TOD names]. [Any school functions]

Top 3 actions for today:
1. [Most urgent]
2. [Second most urgent]
3. [Third most urgent]"

School data: ${dataContext}`,
          }],
        }),
      })

      if (!claudeRes.ok) throw new Error(`Claude API error: ${claudeRes.status}`)
      const claudeData = await claudeRes.json() as { content?: { text: string }[] }
      const brief = claudeData.content?.[0]?.text ?? ''

      // ── 5. Send SMS ────────────────────────────────────────────────────────
      // Truncate for SMS (160 chars per segment, AT handles multi-part)
      await sendSMS(principalPhone, brief.slice(0, 960))

      // ── 6. Store in ai_insights ────────────────────────────────────────────
      await db.from('ai_insights').insert({
        school_id:    schoolId,
        insight_type: 'morning_brief',
        content:      brief,
        target_type:  'morning_brief',
        severity:     'info',
        created_at:   new Date().toISOString(),
      }).then(() => {}, () => {})

      results.push({ school: school.name, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[morning-brief] ${school.name}: ${msg}`)
      results.push({ school: school.name, ok: false, error: msg })
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status:  200,
    headers: { 'Content-Type': 'application/json' },
  })
})
