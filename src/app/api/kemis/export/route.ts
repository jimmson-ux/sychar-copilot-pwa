// GET /api/kemis/export
// Generates a KEMIS-formatted .xlsx file for all active students.
// Flags students missing a NEMIS number.
// Principal and admin only.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import * as XLSX from 'xlsx'
import { formatKEMISDate, kemisGender } from '@/lib/kemis'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED = new Set(['principal', 'deputy_admin', 'admin', 'deputy_principal'])

type StudentRow = {
  id: string
  full_name: string
  admission_number: string | null
  gender: string | null
  date_of_birth: string | null
  class_name: string | null
  stream_name: string | null
  nemis_no: string | null
  special_needs: string | null
  county: string | null
  sub_county: string | null
  nationality: string | null
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!ALLOWED.has(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: principal or admin only' }, { status: 403 })
  }

  const db = svc()

  const { data: students, error } = await db
    .from('students')
    .select('id, full_name, admission_number, gender, date_of_birth, class_name, stream_name, nemis_no, special_needs, county, sub_county, nationality')
    .eq('school_id', auth.schoolId!)
    .eq('is_active', true)
    .order('class_name')
    .order('full_name')

  if (error) {
    console.error('[kemis/export]', error.message)
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }

  const allStudents = (students ?? []) as StudentRow[]

  const warnings: { admNo: string; name: string }[] = []
  const records = allStudents.map(s => {
    if (!s.nemis_no) {
      warnings.push({ admNo: s.admission_number ?? '—', name: s.full_name })
    }
    return {
      NEMIS_No:     s.nemis_no ?? 'None',
      Adm_No:       s.admission_number ?? '',
      Full_Name:    s.full_name,
      Gender:       kemisGender(s.gender),
      DOB:          formatKEMISDate(s.date_of_birth),
      Class:        s.class_name ?? '',
      Stream:       s.stream_name ?? '',
      Special_Needs: s.special_needs ?? 'None',
      County:       s.county ?? 'None',
      Sub_County:   s.sub_county ?? 'None',
      Nationality:  s.nationality ?? 'Kenyan',
    }
  })

  // Build workbook with two sheets: Records and Warnings
  const wb = XLSX.utils.book_new()

  const wsRecords = XLSX.utils.json_to_sheet(records)
  XLSX.utils.book_append_sheet(wb, wsRecords, 'KEMIS Records')

  if (warnings.length > 0) {
    const wsWarnings = XLSX.utils.json_to_sheet(warnings)
    XLSX.utils.book_append_sheet(wb, wsWarnings, 'Missing NEMIS')
  }

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  // Fetch school short name for filename
  const { data: tenant } = await db
    .from('tenant_configs')
    .select('name, school_short_code')
    .eq('school_id', auth.schoolId!)
    .single()

  type TenantRow = { name: string; school_short_code: string }
  const t = tenant as TenantRow | null
  const schoolSlug = (t?.name ?? 'school').replace(/\s+/g, '_').slice(0, 20)
  const dateStr    = new Date().toISOString().split('T')[0]
  const filename   = `KEMIS_${schoolSlug}_${dateStr}.xlsx`

  // Log export
  await db.from('kemis_exports').insert({
    school_id:    auth.schoolId,
    exported_by:  auth.userId,
    record_count: records.length,
    warning_count: warnings.length,
    exported_at:  new Date().toISOString(),
  }).then(
    () => {},
    e => console.error('[kemis/export] log error:', e)
  )

  return new NextResponse(xlsxBuffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-KEMIS-Total':       String(records.length),
      'X-KEMIS-Warnings':    String(warnings.length),
    },
  })
}
