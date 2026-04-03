// POST /api/university-matching/batch
// Generates university matches for every student in the school sequentially.
// Principal-only: enforced by sub_role check after auth.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const PRINCIPAL_ROLES = ['principal', 'deputy_principal']

interface StudentMinimal {
  id: string
  full_name: string
}

interface BatchError {
  student_id: string
  name: string
  error: string
}

export async function POST() {
  const sb = getClient()
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  // Batch generation is an expensive operation — restrict to principal-level roles
  if (!PRINCIPAL_ROLES.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden: insufficient role' }, { status: 403 })
  }

  try {
    const { data: students, error: sErr } = await sb
      .from('students')
      .select('id, full_name')
      .eq('school_id', auth.schoolId) // verified school from session
      .order('full_name', { ascending: true })

    if (sErr) {
      console.error('[batch] students query error:', sErr.message)
      return NextResponse.json({ error: 'Failed to load students' }, { status: 500 })
    }
    if (!students || students.length === 0) {
      return NextResponse.json({ processed: 0, total: 0, errors: [] })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    let processed = 0
    const errors: BatchError[] = []

    for (const student of students as StudentMinimal[]) {
      try {
        const res = await fetch(`${baseUrl}/api/university-matching`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: student.id }),
        })

        if (res.ok) {
          processed++
        } else {
          const payload = await res.json() as { error?: string }
          errors.push({
            student_id: student.id,
            name: student.full_name,
            error: payload.error ?? `HTTP ${res.status}`,
          })
        }
      } catch (err) {
        errors.push({
          student_id: student.id,
          name: student.full_name,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({ processed, total: students.length, errors })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[batch] error:', msg)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
