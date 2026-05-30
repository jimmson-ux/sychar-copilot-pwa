import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const db = createAdminSupabaseClient()

    const [
      schoolsRes,
      appointmentsRes,
      queriesRes,
      consentRes,
      parentMsgsRes,
    ] = await Promise.all([
      db.from('schools').select('id, name, is_active'),
      db.from('appointments')
        .select('id, school_id, student_id, staff_id, proposed_datetime, purpose, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200),
      db.from('parent_query_logs')
        .select('id, school_id, parent_id, category, status, created_at, escalated_to')
        .order('created_at', { ascending: false })
        .limit(200),
      // Parent consent: count parent_consents or guardian_consent
      db.from('parent_students')
        .select('school_id, consented')
        .limit(5000),
      db.from('parent_messages')
        .select('id, school_id, sender_role, created_at')
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const schools = schoolsRes.data ?? []
    const schoolMap: Record<string, string> = {}
    for (const s of schools) schoolMap[s.id] = s.name

    // Appointments by school & status
    const apptSummary: Record<string, { pending: number; confirmed: number; completed: number; cancelled: number }> = {}
    for (const a of (appointmentsRes.data ?? [])) {
      if (!apptSummary[a.school_id]) {
        apptSummary[a.school_id] = { pending: 0, confirmed: 0, completed: 0, cancelled: 0 }
      }
      const st = (a.status ?? '').toLowerCase() as keyof typeof apptSummary[string]
      if (st in apptSummary[a.school_id]) apptSummary[a.school_id][st]++
    }

    // Queries by school
    const querySummary: Record<string, { open: number; closed: number; escalated: number }> = {}
    for (const q of (queriesRes.data ?? [])) {
      if (!querySummary[q.school_id]) querySummary[q.school_id] = { open: 0, closed: 0, escalated: 0 }
      if (q.status === 'open')   querySummary[q.school_id].open++
      if (q.status === 'closed') querySummary[q.school_id].closed++
      if (q.escalated_to)        querySummary[q.school_id].escalated++
    }

    // Consent rate by school
    const consentBySchool: Record<string, { total: number; consented: number }> = {}
    for (const p of (consentRes.data ?? [])) {
      if (!consentBySchool[p.school_id]) consentBySchool[p.school_id] = { total: 0, consented: 0 }
      consentBySchool[p.school_id].total++
      if (p.consented) consentBySchool[p.school_id].consented++
    }

    // Query category breakdown
    const categoryCounts: Record<string, number> = {}
    for (const q of (queriesRes.data ?? [])) {
      const cat = q.category ?? 'other'
      categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1
    }

    // Per-school parent stats
    const perSchool = schools.map((s: any) => {
      const appt     = apptSummary[s.id]   ?? { pending: 0, confirmed: 0, completed: 0, cancelled: 0 }
      const qry      = querySummary[s.id]  ?? { open: 0, closed: 0, escalated: 0 }
      const consent  = consentBySchool[s.id] ?? { total: 0, consented: 0 }
      const consentRate = consent.total > 0
        ? Math.round((consent.consented / consent.total) * 100)
        : 0
      return {
        schoolId:   s.id,
        schoolName: s.name,
        isActive:   s.is_active,
        appointments: appt,
        queries:      qry,
        consent:      { ...consent, rate: consentRate },
      }
    })

    const totalPendingAppts = (appointmentsRes.data ?? []).filter((a: any) => a.status === 'Pending').length
    const totalOpenQueries  = (queriesRes.data ?? []).filter((q: any) => q.status === 'open').length
    const totalParents      = (consentRes.data ?? []).length
    const totalConsented    = (consentRes.data ?? []).filter((p: any) => p.consented).length

    return NextResponse.json({
      summary: {
        totalPendingAppts,
        totalOpenQueries,
        totalParents,
        totalConsented,
        globalConsentRate: totalParents > 0 ? Math.round((totalConsented / totalParents) * 100) : 0,
      },
      categoryCounts,
      recentAppointments: (appointmentsRes.data ?? []).slice(0, 30).map((a: any) => ({
        ...a,
        schoolName: schoolMap[a.school_id] ?? 'Unknown',
      })),
      recentQueries: (queriesRes.data ?? []).slice(0, 30).map((q: any) => ({
        ...q,
        schoolName: schoolMap[q.school_id] ?? 'Unknown',
      })),
      perSchool,
    })
  } catch (err: any) {
    console.error('[platform/parents]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
