import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const db = createAdminSupabaseClient()

    const [
      staffRes,
      studentsRes,
      invoicesRes,
      paymentsRes,
      flagsRes,
      appointmentsRes,
      queriesRes,
      dutyRes,
    ] = await Promise.all([
      db.from('staff_records')
        .select('id, full_name, sub_role, email, phone, is_active, can_login, department, employment_type')
        .eq('school_id', id)
        .order('sub_role'),
      db.from('students')
        .select('id, class_name, stream, full_name, admission_no, is_active')
        .eq('school_id', id)
        .eq('is_active', true)
        .order('class_name'),
      db.from('invoices')
        .select('id, student_id, amount_due, amount_paid, term, academic_year')
        .eq('school_id', id)
        .limit(1000),
      db.from('fee_payments')
        .select('id, student_id, amount, payment_method, payment_date, pending_confirmation')
        .eq('school_id', id)
        .order('payment_date', { ascending: false })
        .limit(200),
      db.from('student_flags')
        .select('id, student_id, reason, severity, created_at, reviewed')
        .eq('school_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      db.from('appointments')
        .select('id, student_id, staff_id, proposed_datetime, purpose, status, rescheduled_datetime')
        .eq('school_id', id)
        .order('proposed_datetime', { ascending: false })
        .limit(50),
      db.from('parent_query_logs')
        .select('id, parent_id, category, status, created_at')
        .eq('school_id', id)
        .order('created_at', { ascending: false })
        .limit(50),
      db.from('duty_rosters')
        .select('id, teacher_id, area, day_of_week, week_starting')
        .eq('school_id', id)
        .order('week_starting', { ascending: false })
        .limit(50),
    ])

    // Class breakdown
    const classCounts: Record<string, number> = {}
    for (const s of (studentsRes.data ?? [])) {
      const cls = s.class_name ?? 'Unknown'
      classCounts[cls] = (classCounts[cls] ?? 0) + 1
    }
    const classBreakdown = Object.entries(classCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Fee summary
    const totalInvoiced = (invoicesRes.data ?? []).reduce((s: number, r: any) => s + (r.amount_due ?? 0), 0)
    const totalPaid     = (paymentsRes.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0)
    const collectionRate = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0

    // Staff by role
    const staffByRole: Record<string, number> = {}
    for (const s of (staffRes.data ?? [])) {
      const role = s.sub_role ?? 'unknown'
      staffByRole[role] = (staffByRole[role] ?? 0) + 1
    }

    return NextResponse.json({
      staff:        staffRes.data ?? [],
      staffByRole,
      students: {
        total:          studentsRes.data?.length ?? 0,
        classBreakdown,
      },
      fees: {
        totalInvoiced,
        totalPaid,
        balance:     totalInvoiced - totalPaid,
        collectionRate,
        recentPayments: paymentsRes.data ?? [],
        pendingConfirmations: (paymentsRes.data ?? []).filter((p: any) => p.pending_confirmation).length,
      },
      flags: {
        total:      flagsRes.data?.length ?? 0,
        unreviewed: (flagsRes.data ?? []).filter((f: any) => !f.reviewed).length,
        items:      flagsRes.data ?? [],
      },
      appointments: {
        total:   appointmentsRes.data?.length ?? 0,
        pending: (appointmentsRes.data ?? []).filter((a: any) => a.status === 'Pending').length,
        items:   appointmentsRes.data ?? [],
      },
      queries: {
        total: queriesRes.data?.length ?? 0,
        open:  (queriesRes.data ?? []).filter((q: any) => q.status === 'open').length,
        items: queriesRes.data ?? [],
      },
      duties: dutyRes.data ?? [],
    })
  } catch (err: any) {
    console.error('[platform/school]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = await req.json()
    const db = createAdminSupabaseClient()

    // Staff update: { staffId, patch: { sub_role?, is_active?, can_login? } }
    if (body.staffId && body.patch) {
      const { error } = await db.from('staff_records')
        .update(body.patch)
        .eq('id', body.staffId)
        .eq('school_id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // School settings: { schoolPatch: { is_active?, tier? } }
    if (body.schoolPatch) {
      const { error } = await db.from('schools')
        .update(body.schoolPatch)
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'No valid patch' }, { status: 400 })
  } catch (err: any) {
    console.error('[platform/school PATCH]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
