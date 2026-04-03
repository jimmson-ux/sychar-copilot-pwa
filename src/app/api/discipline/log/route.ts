import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { validateTeacherToken } from '@/lib/validateTeacherToken'

const DisciplineSchema = z.object({
  token:       z.string().min(8),
  studentId:   z.string().uuid(),
  className:   z.string().min(1).max(100),
  offenceType: z.enum([
    'Late', 'Uniform', 'Disruption', 'Absenteeism',
    'Insubordination', 'Fighting', 'Cheating', 'Disrespect', 'Other',
  ]),
  severity:    z.enum(['Minor', 'Moderate', 'Serious', 'Critical']),
  notes:       z.string().max(300).optional(),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = DisciplineSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { token, studentId, className, offenceType, severity, notes, date } = parsed.data

  const info = await validateTeacherToken(token)
  if (!info) return NextResponse.json({ error: 'Invalid token' }, { status: 403 })

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Verify student belongs to this school
  const { data: student } = await sb
    .from('students')
    .select('id, full_name, parent_phone')
    .eq('id', studentId)
    .eq('school_id', info.schoolId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Count recent incidents (pattern alert: 3+ this week)
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: recentCount } = await sb
    .from('discipline_records')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .gte('incident_date', weekAgo.toISOString().split('T')[0])

  // Insert discipline record
  const { error: insertErr } = await sb
    .from('discipline_records')
    .insert({
      student_id:    studentId,
      school_id:     info.schoolId,
      reported_by:   info.teacherId,
      incident_type: offenceType,
      severity:      severity.toLowerCase(),
      description:   notes ?? null,
      incident_date: date,
      class_name:    className,
    })

  if (insertErr) {
    console.error('[discipline/log]', insertErr.message)
    return NextResponse.json({ error: 'Failed to save record' }, { status: 500 })
  }

  // Auto-WhatsApp parent for Serious/Critical (fire-and-forget)
  const needsAlert = severity === 'Serious' || severity === 'Critical'
  if (needsAlert && student.parent_phone && process.env.WHATSAPP_API_TOKEN) {
    const phone = student.parent_phone.replace(/\D/g, '')
    const msg = `Habari. Tunataka kukujulisha kuhusu ${student.full_name} leo (${date}). Tatizo: ${offenceType} (${severity}). Tafadhali wasiliana na shule kwa maelezo zaidi. — Nkoroi Mixed Day Secondary School`
    fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `254${phone.slice(-9)}`,
        type: 'text',
        text: { body: msg },
      }),
    }).catch(e => console.error('[whatsapp alert]', e))
  }

  return NextResponse.json({
    success: true,
    patternAlert: (recentCount ?? 0) >= 2, // alert if this is 3rd+ incident
    recentCount: (recentCount ?? 0) + 1,
    parentAlerted: needsAlert && !!student.parent_phone,
  })
}
