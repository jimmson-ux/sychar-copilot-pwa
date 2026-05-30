import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const db = createAdminSupabaseClient()

    const [
      schoolsRes,
      studentsRes,
      staffRes,
      invoicesRes,
      paymentsRes,
      flagsRes,
      appointmentsRes,
      parentQueryRes,
    ] = await Promise.all([
      db.from('schools').select('id, name, is_active, student_count, county, created_at, subscription_expires_at'),
      db.from('students').select('id, school_id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('staff_records').select('id, school_id', { count: 'exact', head: true }).eq('is_active', true),
      db.from('invoices').select('amount_due').limit(5000),
      db.from('fee_payments').select('amount, payment_date').limit(5000),
      db.from('student_flags').select('id, school_id', { count: 'exact', head: true }).eq('reviewed', false),
      db.from('appointments').select('id, school_id, status').in('status', ['Pending', 'Confirmed']),
      db.from('parent_query_logs').select('id, school_id, status').eq('status', 'open').limit(500),
    ])

    const schools    = schoolsRes.data ?? []
    const totalSchools   = schools.length
    const activeSchools  = schools.filter((s: any) => s.is_active).length
    const totalStudents  = studentsRes.count ?? 0
    const totalStaff     = staffRes.count ?? 0
    const unreviewedFlags = flagsRes.count ?? 0

    const totalInvoiced = (invoicesRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_due ?? 0), 0)
    const totalPaid     = (paymentsRes.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0)
    const collectionRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0

    const pendingAppts   = (appointmentsRes.data ?? []).filter((a: any) => a.status === 'Pending').length
    const confirmedAppts = (appointmentsRes.data ?? []).filter((a: any) => a.status === 'Confirmed').length
    const openQueries    = parentQueryRes.count ?? (parentQueryRes.data ?? []).length

    // Per-school breakdown
    const apptBySchool: Record<string, number> = {}
    for (const a of (appointmentsRes.data ?? [])) {
      apptBySchool[a.school_id] = (apptBySchool[a.school_id] ?? 0) + 1
    }

    // Monthly revenue trend (last 6 months)
    const now = new Date()
    const revByMonth: Record<string, number> = {}
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      revByMonth[key] = 0
    }
    for (const p of (paymentsRes.data ?? [])) {
      if (!p.payment_date) continue
      const key = p.payment_date.slice(0, 7)
      if (key in revByMonth) revByMonth[key] += p.amount ?? 0
    }
    const revTrend = Object.entries(revByMonth).map(([month, amount]) => ({ month, amount }))

    // Subscription health
    const expiringSoon = schools.filter((s: any) => {
      const d = new Date(s.subscription_expires_at)
      const days = Math.ceil((d.getTime() - Date.now()) / 86400000)
      return days < 30 && days >= 0 && s.is_active
    }).map((s: any) => ({ id: s.id, name: s.name, expiresAt: s.subscription_expires_at }))

    return NextResponse.json({
      totals: {
        schools:         totalSchools,
        activeSchools,
        suspendedSchools: totalSchools - activeSchools,
        students:        totalStudents,
        staff:           totalStaff,
        unreviewedFlags,
        pendingAppts,
        confirmedAppts,
        openQueries,
        totalInvoiced,
        totalPaid,
        collectionRate,
      },
      revTrend,
      expiringSoon,
      schoolOverview: schools.map((s: any) => ({
        id:          s.id,
        name:        s.name,
        county:      s.county,
        isActive:    s.is_active,
        studentCount: s.student_count,
        createdAt:   s.created_at,
        expiresAt:   s.subscription_expires_at,
        pendingAppts: apptBySchool[s.id] ?? 0,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
