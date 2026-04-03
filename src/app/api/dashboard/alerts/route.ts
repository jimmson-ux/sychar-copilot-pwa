import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const schoolId = searchParams.get('schoolId')
  const role = searchParams.get('role') || ''

  if (!schoolId) return NextResponse.json({ alerts: [] })

  const supabase = createAdminSupabaseClient()
  const alerts = []

  try {
    // Check for teachers who haven't submitted record of work in 3+ days
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentRecords } = await supabase
      .from('records_of_work')
      .select('teacher_id')
      .eq('school_id', schoolId)
      .gte('created_at', threeDaysAgo)

    const activeTeacherIds = new Set((recentRecords ?? []).map((r: { teacher_id: string }) => r.teacher_id))

    const { count: totalTeachers } = await supabase
      .from('staff_records')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_active', true)
      .in('sub_role', ['class_teacher', 'bom_teacher', 'hod_subjects'])

    const behindCount = Math.max(0, (totalTeachers ?? 0) - activeTeacherIds.size)

    if (behindCount > 0 && ['principal', 'deputy_principal_academics', 'dean_of_studies'].includes(role)) {
      alerts.push({
        id: 'row-missing',
        type: 'warning',
        icon: '⚠️',
        message: `${behindCount} teacher${behindCount !== 1 ? 's' : ''} haven't submitted Record of Work in 3+ days`,
        link: '/dashboard/document-compliance',
        dismissible: true,
      })
    }

    // Check for timetable published status
    const { count: publishedTimetable } = await supabase
      .from('timetable')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId)
      .eq('is_published', true)

    if ((publishedTimetable ?? 0) === 0 && ['deputy_principal_academics'].includes(role)) {
      alerts.push({
        id: 'timetable-unpublished',
        type: 'warning',
        icon: '📋',
        message: 'Timetable not yet published for this term',
        link: '/dashboard/timetable',
        dismissible: true,
      })
    }

    // Check fee collection rate
    const { data: fees } = await supabase
      .from('fee_balances')
      .select('total_fees, amount_paid')
      .eq('school_id', schoolId)

    if (fees && fees.length > 0) {
      const totalFees = fees.reduce((s: number, f: { total_fees: number }) => s + (f.total_fees || 0), 0)
      const totalPaid = fees.reduce((s: number, f: { amount_paid: number }) => s + (f.amount_paid || 0), 0)
      const rate = totalFees > 0 ? (totalPaid / totalFees) * 100 : 100

      if (rate < 50 && ['principal', 'bursar'].includes(role)) {
        alerts.push({
          id: 'fee-low',
          type: 'critical',
          icon: '🔴',
          message: `Fee collection is at ${Math.round(rate)}% — below the 50% threshold`,
          link: '/dashboard/fee-records',
          dismissible: false,
        })
      }
    }

    return NextResponse.json({ alerts })
  } catch {
    return NextResponse.json({ alerts: [] })
  }
}
