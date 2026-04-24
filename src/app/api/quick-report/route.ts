// POST /api/quick-report — public discipline submission gated by weekly HMAC PIN
// Used by duty teachers / security guards without a staff login.
// No session required — PIN proves physical presence at school.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { rateLimit, LIMITS } from '@/lib/rateLimit'

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function currentWeekNumber(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
}

function generatePin(schoolShortCode: string, week: number): string {
  const secret = process.env.QUICK_REPORT_PIN_SECRET ?? 'sychar-qr-pin-fallback'
  const raw = createHmac('sha1', secret)
    .update(`${schoolShortCode}:${week}`)
    .digest('hex')
  // Take first 6 numeric digits from the hex digest
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 6).padEnd(6, '0')
  return digits
}

function validatePin(schoolShortCode: string, pin: string): boolean {
  const week = currentWeekNumber()
  // Accept current week or previous (handles Sunday midnight edge case)
  return pin === generatePin(schoolShortCode, week)
    || pin === generatePin(schoolShortCode, week - 1)
}

// GET — load school rules for a given short code + pin
export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`qr-get:${ip}`, LIMITS.API_GENERAL.max, LIMITS.API_GENERAL.window)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { searchParams } = req.nextUrl
  const code = (searchParams.get('code') ?? '').trim()
  const pin  = (searchParams.get('pin')  ?? '').trim()
  const q    = (searchParams.get('q')    ?? '').trim()

  if (!code || !pin) return NextResponse.json({ error: 'code and pin required' }, { status: 400 })
  if (!validatePin(code, pin)) return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 })

  const db = svc()

  // Resolve school by short code
  const { data: tenant } = await db
    .from('tenant_configs')
    .select('school_id, name')
    .eq('school_short_code', code)
    .single()

  if (!tenant) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  // Load categories from school_rules
  const { data: rules } = await db
    .from('school_rules')
    .select('id, category, rule_text, severity')
    .eq('school_id', tenant.school_id)
    .eq('is_active', true)
    .order('category')

  // Search students if query provided
  let students: { id: string; full_name: string; admission_no: string; class_name: string }[] = []
  if (q.length >= 2) {
    const { data } = await db
      .from('students')
      .select('id, full_name, admission_no, class_name')
      .eq('school_id', tenant.school_id)
      .eq('is_active', true)
      .or(`full_name.ilike.%${q}%,admission_no.ilike.%${q}%`)
      .limit(10)
    students = (data ?? []) as typeof students
  }

  return NextResponse.json({
    school_name: tenant.name,
    school_id:   tenant.school_id,
    rules:       rules ?? [],
    students,
  })
}

// POST — submit discipline record
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
  const { allowed } = rateLimit(`qr-post:${ip}`, 10, 5 * 60 * 1000)
  if (!allowed) return NextResponse.json({ error: 'Too many submissions' }, { status: 429 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { school_code, pin, student_id, school_id, category, severity, description } = body as {
    school_code: string
    pin:         string
    student_id:  string
    school_id:   string
    category:    string
    severity:    string
    description: string
  }

  if (!school_code || !pin || !student_id || !school_id || !category || !severity) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!validatePin(school_code, pin)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 403 })
  }

  const db = svc()

  // Verify student belongs to this school
  const { data: student } = await db
    .from('students')
    .select('id, full_name, class_name, class_teacher_id, parent_phone')
    .eq('id', student_id)
    .eq('school_id', school_id)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const today = new Date().toISOString().split('T')[0]

  const { data: record, error } = await db
    .from('discipline_records')
    .insert({
      student_id:    student.id,
      school_id,
      incident_type: category,
      severity:      severity.toLowerCase(),
      description:   description?.trim() ?? null,
      incident_date: today,
      class_name:    student.class_name,
      source:        'quick_report',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[quick-report POST]', error.message)
    return NextResponse.json({ error: 'Failed to save record' }, { status: 500 })
  }

  // Notify class teacher via alert
  if (student.class_teacher_id) {
    await db.from('alerts').insert({
      school_id,
      type:     'quick_report_discipline',
      severity: severity.toLowerCase() === 'critical' ? 'critical' : 'medium',
      title:    `Quick report: ${student.full_name} — ${category}`,
      detail:   { record_id: record.id, severity, student_id: student.id },
      user_id:  student.class_teacher_id,
    }).then(() => {}, () => {})
  }

  // For critical: also alert the principal
  if (severity.toLowerCase() === 'critical') {
    const { data: principal } = await db
      .from('staff_records')
      .select('user_id')
      .eq('school_id', school_id)
      .eq('sub_role', 'principal')
      .eq('is_active', true)
      .limit(1)
      .single()

    if (principal) {
      await db.from('alerts').insert({
        school_id,
        type:     'quick_report_critical',
        severity: 'critical',
        title:    `CRITICAL quick report: ${student.full_name} — ${category}`,
        detail:   { record_id: record.id, student_id: student.id },
        user_id:  principal.user_id,
      }).then(() => {}, () => {})
    }
  }

  return NextResponse.json({ ok: true, record_id: record.id })
}
