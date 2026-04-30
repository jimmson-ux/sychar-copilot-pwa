// Monthly Impact Report — runs 8 AM on the 1st of every month
// Calculates time saved, financial health, at-risk students, sends email via Resend

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY    = Deno.env.get('RESEND_API_KEY') ?? ''
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async () => {
  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const now       = new Date()
  const monthName = now.toLocaleString('en-KE', { month: 'long', year: 'numeric' })
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const monthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()

  // Fetch all active schools
  const { data: schools } = await db
    .from('tenant_configs')
    .select('school_id, name, principal_email, principal_name, region, current_term')
    .in('subscription_status', ['active', 'trial'])

  if (!schools?.length) return new Response('No active schools', { status: 200 })

  const results: string[] = []

  for (const school of schools) {
    try {
      const sid = school.school_id as string

      // ── Parallel data fetch ──────────────────────────────────────────────
      const [
        attRes, feeRes, riskRes, disciplineRes, benchRes,
      ] = await Promise.all([
        // Attendance logs this month
        db.from('attendance_records')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', sid)
          .gte('date', monthStart.split('T')[0])
          .lte('date', monthEnd.split('T')[0]),

        // Fee payments this month
        db.from('fee_records')
          .select('id, amount_paid', { count: 'exact' })
          .eq('school_id', sid)
          .gte('paid_at', monthStart)
          .lte('paid_at', monthEnd),

        // At-risk students (high + critical from latest compute)
        db.from('student_risk_scores')
          .select('id, risk_tier', { count: 'exact', head: false })
          .eq('school_id', sid)
          .in('risk_tier', ['high', 'critical'])
          .order('computed_at', { ascending: false })
          .limit(200),

        // Discipline incidents this month
        db.from('discipline_records')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', sid)
          .gte('incident_date', monthStart.split('T')[0]),

        // Financial health
        db.from('school_financial_health')
          .select('collection_rate, health_tier, regional_avg, gap_percent')
          .eq('school_id', sid)
          .order('computed_at', { ascending: false })
          .limit(1)
          .single(),
      ])

      const attendanceLogs  = attRes.count ?? 0
      const feePayments     = feeRes.count ?? 0
      const feeAmount       = (feeRes.data ?? []).reduce(
        (sum: number, r: { amount_paid: number }) => sum + (r.amount_paid ?? 0), 0
      )
      const atRiskCount     = riskRes.data?.length ?? 0
      const disciplineCount = disciplineRes.count ?? 0
      const health          = benchRes.data

      // ── Time saved calculation ───────────────────────────────────────────
      // Attendance: 0.5 min per log (vs manual register)
      // Fee payment: 3 min per record (vs manual receipt)
      // Discipline log: 2 min per record
      const minutesSaved = Math.round(
        (attendanceLogs * 0.5) + (feePayments * 3) + (disciplineCount * 2)
      )
      const hoursSaved   = (minutesSaved / 60).toFixed(1)

      // ── De-duplicate at-risk by student ─────────────────────────────────
      const seenIds = new Set<string>()
      const uniqueAtRisk: typeof riskRes.data = []
      for (const r of (riskRes.data ?? [])) {
        if (!seenIds.has(r.id)) { seenIds.add(r.id); uniqueAtRisk.push(r) }
      }
      const criticalCount = uniqueAtRisk.filter(r => r.risk_tier === 'critical').length
      const highCount     = uniqueAtRisk.filter(r => r.risk_tier === 'high').length

      // ── Build HTML email ─────────────────────────────────────────────────
      const collectionRate = health?.collection_rate ?? 0
      const healthTier     = health?.health_tier ?? 'unknown'
      const regionalAvg    = health?.regional_avg ?? 60
      const gapPercent     = health?.gap_percent ?? 0
      const tierColor      = healthTier === 'excellent' ? '#16a34a'
        : healthTier === 'good' ? '#2563eb'
        : healthTier === 'warning' ? '#d97706'
        : '#dc2626'

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:20px">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#16a34a;padding:32px 32px 24px;color:white">
    <p style="margin:0;font-size:12px;opacity:0.8;text-transform:uppercase;letter-spacing:0.06em">Monthly Impact Report</p>
    <h1 style="margin:8px 0 4px;font-size:24px;font-weight:800">${school.name}</h1>
    <p style="margin:0;font-size:14px;opacity:0.9">${monthName}</p>
  </div>

  <!-- Greeting -->
  <div style="padding:24px 32px 0">
    <p style="color:#374151;font-size:15px">Dear ${school.principal_name ?? 'Principal'},</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6">
      Here is your school's operational summary for ${monthName}.
      Sychar CoPilot saved your team approximately <strong style="color:#16a34a">${hoursSaved} hours</strong> of administrative work this month.
    </p>
  </div>

  <!-- Stats grid -->
  <div style="padding:20px 32px;display:grid">
    <table width="100%" cellpadding="0" cellspacing="8">
      <tr>
        <td width="50%" style="padding:4px">
          <div style="background:#f0fdf4;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:28px;font-weight:800;color:#16a34a">${attendanceLogs.toLocaleString()}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Attendance Logs</p>
          </div>
        </td>
        <td width="50%" style="padding:4px">
          <div style="background:#eff6ff;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:28px;font-weight:800;color:#2563eb">${feePayments.toLocaleString()}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Fee Payments (KES ${feeAmount.toLocaleString('en-KE')})</p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:4px">
          <div style="background:#fef3c7;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:28px;font-weight:800;color:#d97706">${criticalCount + highCount}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280">At-Risk Students (${criticalCount} critical, ${highCount} high)</p>
          </div>
        </td>
        <td style="padding:4px">
          <div style="background:#fdf4ff;border-radius:12px;padding:16px;text-align:center">
            <p style="margin:0;font-size:28px;font-weight:800;color:#9333ea">${hoursSaved}h</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Admin Hours Saved</p>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Financial health -->
  <div style="padding:8px 32px 24px">
    <div style="background:#f9fafb;border-radius:12px;padding:20px">
      <h3 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em">Fee Collection Health</h3>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <span style="font-size:32px;font-weight:800;color:${tierColor}">${collectionRate.toFixed(1)}%</span>
        <span style="background:${tierColor}18;color:${tierColor};padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase">${healthTier}</span>
      </div>
      <div style="background:#e5e7eb;border-radius:99px;height:8px;margin-bottom:8px">
        <div style="background:${tierColor};width:${Math.min(100, collectionRate)}%;height:100%;border-radius:99px"></div>
      </div>
      <p style="margin:0;font-size:12px;color:#9ca3af">
        Regional average: ${regionalAvg.toFixed(1)}%
        ${gapPercent >= 0
          ? `· <span style="color:#16a34a">+${gapPercent.toFixed(1)}% above average</span>`
          : `· <span style="color:#dc2626">${gapPercent.toFixed(1)}% below average — escalate parent communication</span>`
        }
      </p>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb">
    <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
      Sychar CoPilot · ${school.name} · Term ${school.current_term ?? 2}<br>
      This is an automated report. Log in to your dashboard for full details.
    </p>
  </div>
</div>
</body>
</html>`

      // ── Send via Resend ──────────────────────────────────────────────────
      if (RESEND_API_KEY && school.principal_email) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            from:    'Sychar CoPilot <reports@mail.sychar.co.ke>',
            to:      [school.principal_email],
            subject: `${school.name} — Monthly Impact Report (${monthName})`,
            html,
          }),
        })
        if (!emailRes.ok) {
          console.error(`[report] Email failed for ${school.name}:`, await emailRes.text())
        }
      }

      // ── Log to principal_briefs ──────────────────────────────────────────
      await db.from('principal_briefs').insert({
        school_id:    sid,
        brief_type:   'monthly_impact',
        title:        `Monthly Impact Report — ${monthName}`,
        content:      JSON.stringify({
          attendance_logs:  attendanceLogs,
          fee_payments:     feePayments,
          fee_amount:       feeAmount,
          at_risk_count:    criticalCount + highCount,
          hours_saved:      parseFloat(hoursSaved),
          collection_rate:  collectionRate,
          health_tier:      healthTier,
        }),
        generated_at: new Date().toISOString(),
      }).then(() => null).catch(() => null)  // fire-and-forget

      results.push(`✓ ${school.name}`)
    } catch (err) {
      results.push(`✗ ${school.name}: ${err}`)
    }
  }

  return new Response(
    JSON.stringify({ processed: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
