import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/teacher/classes?staffId=xxx
// Returns class list for a staff member based on timetable assignments.
// Used by the /record landing screen after department code verification.

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const staffId = searchParams.get('staffId')
  const token   = searchParams.get('token')

  if (!staffId && !token) {
    return NextResponse.json({ error: 'Missing staffId or token' }, { status: 400 })
  }

  const sb = getClient()

  let teacherId = staffId

  // Backward compat: resolve staffId from token
  if (!teacherId && token) {
    const { data: tokenRow } = await sb
      .from('teacher_tokens')
      .select('teacher_id')
      .eq('token', token)
      .eq('is_active', true)
      .single()
    teacherId = tokenRow?.teacher_id ?? null
  }

  if (!teacherId) return NextResponse.json({ classes: [] })

  const { data: assignments } = await sb
    .from('timetable')
    .select('class_name')
    .eq('teacher_id', teacherId)

  const classSet = new Set<string>()
  for (const a of assignments ?? []) {
    if (a.class_name) classSet.add(a.class_name)
  }

  return NextResponse.json({ classes: [...classSet] })
}
