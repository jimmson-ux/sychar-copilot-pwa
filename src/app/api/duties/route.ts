import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { searchParams } = req.nextUrl
  const teacherId = searchParams.get('teacher_id')
  const week = searchParams.get('week') // e.g. "2026-W14"
  const fromDate = searchParams.get('from')
  const toDate   = searchParams.get('to')

  const admin = getAdmin()
  let query = admin
    .from('duty_assignments')
    .select(`
      id, teacher_id, duty_date, duty_type, time_slot, post, remarks,
      notify_whatsapp, created_at,
      staff_records!teacher_id ( full_name, photo_url, subject_specialization, department )
    `)
    .eq('school_id', auth.schoolId)
    .order('duty_date', { ascending: true })

  if (teacherId) {
    query = query.eq('teacher_id', teacherId)
  }

  if (fromDate && toDate) {
    query = query.gte('duty_date', fromDate).lte('duty_date', toDate)
  } else if (week) {
    // Parse ISO week e.g. "2026-W14"
    const [yearStr, weekStr] = week.split('-W')
    const year = parseInt(yearStr)
    const weekNum = parseInt(weekStr)
    const jan4 = new Date(year, 0, 4)
    const startOfWeek = new Date(jan4)
    startOfWeek.setDate(jan4.getDate() - jan4.getDay() + 1 + (weekNum - 1) * 7)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    query = query
      .gte('duty_date', startOfWeek.toISOString().split('T')[0])
      .lte('duty_date', endOfWeek.toISOString().split('T')[0])
  } else if (!teacherId) {
    // Default: next 30 days
    const today = new Date().toISOString().split('T')[0]
    const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    query = query.gte('duty_date', today).lte('duty_date', future)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ duties: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const ALLOWED = [
    'principal','deputy_principal','deputy_principal_academics','deputy_principal_discipline',
    'dean_of_studies','deputy_dean_of_studies','dean_of_students',
    'form_principal_form4','form_principal_grade10',
  ]
  if (!ALLOWED.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: {
    teacher_id: string
    duty_date: string
    duty_type: string
    time_slot?: string
    post?: string
    remarks?: string
    notify_whatsapp?: boolean
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = getAdmin()
  const { data, error } = await admin
    .from('duty_assignments')
    .insert({
      school_id: auth.schoolId,
      teacher_id: body.teacher_id,
      duty_date: body.duty_date,
      duty_type: body.duty_type,
      time_slot: body.time_slot ?? null,
      post: body.post ?? null,
      remarks: body.remarks ?? null,
      notify_whatsapp: body.notify_whatsapp ?? false,
      assigned_by: auth.userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ duty: data })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = getAdmin()
  const { error } = await admin
    .from('duty_assignments')
    .delete()
    .eq('id', id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
