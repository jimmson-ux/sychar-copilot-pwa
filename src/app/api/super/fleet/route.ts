export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()

  const [schoolsRes, configsRes, studentsRes, staffRes] = await Promise.all([
    db.from('schools').select('id, name, county, student_count, is_active, subscription_expires_at, features, created_at').order('name'),
    db.from('tenant_configs').select('school_id, school_short_code'),
    db.from('students').select('school_id', { count: 'exact', head: false }).eq('is_active', true),
    db.from('staff_records').select('school_id', { count: 'exact', head: false }).eq('is_active', true),
  ])

  if (schoolsRes.error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  type ConfigRow = { school_id: string; school_short_code: string | null }
  type CountRow  = { school_id: string }

  const codeMap    = new Map((configsRes.data as ConfigRow[] ?? []).map(r => [r.school_id, r.school_short_code]))
  const studentMap = new Map<string, number>()
  const staffMap   = new Map<string, number>()

  for (const r of (studentsRes.data as CountRow[] ?? [])) {
    studentMap.set(r.school_id, (studentMap.get(r.school_id) ?? 0) + 1)
  }
  for (const r of (staffRes.data as CountRow[] ?? [])) {
    staffMap.set(r.school_id, (staffMap.get(r.school_id) ?? 0) + 1)
  }

  type SchoolRow = {
    id: string; name: string; county: string; student_count: number
    is_active: boolean; subscription_expires_at: string
    features: Record<string, boolean>; created_at: string
  }

  const schools = (schoolsRes.data as SchoolRow[]).map(s => {
    const expires = new Date(s.subscription_expires_at)
    const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86_400_000)
    const addons   = Object.values(s.features ?? {}).filter(Boolean).length
    return {
      id:           s.id,
      name:         s.name,
      county:       s.county,
      shortCode:    codeMap.get(s.id) ?? null,
      studentCount: studentMap.get(s.id) ?? s.student_count,
      staffCount:   staffMap.get(s.id) ?? 0,
      isActive:     s.is_active,
      expiresAt:    s.subscription_expires_at,
      daysLeft,
      addons,
      features:     s.features,
      health:       !s.is_active ? 'red' : daysLeft < 0 ? 'red' : daysLeft <= 14 ? 'amber' : 'green',
      createdAt:    s.created_at,
    }
  })

  const total      = schools.length
  const active     = schools.filter(s => s.isActive).length
  const expiring   = schools.filter(s => s.isActive && s.daysLeft >= 0 && s.daysLeft <= 30).length
  const expired    = schools.filter(s => s.isActive && s.daysLeft < 0).length
  const students   = schools.reduce((n, s) => n + s.studentCount, 0)

  return NextResponse.json({ schools, stats: { total, active, expiring, expired, students } })
}
