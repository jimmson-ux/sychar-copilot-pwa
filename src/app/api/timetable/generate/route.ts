// POST /api/timetable/generate
// Queues a GA timetable generation job and fires it in the background.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_ROLES = [
  'deputy_principal_academics',
  'deputy_principal_academic',
  'principal',
]

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { userId, schoolId, subRole } = auth

  if (!ALLOWED_ROLES.includes(subRole)) {
    return NextResponse.json(
      { error: 'Forbidden: deputy_academic or principal role required' },
      { status: 403 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { term, academicYear, classes = [], weights = {} } = body as {
    term?: number
    academicYear?: string
    classes?: string[]
    weights?: { W_c?: number; W_p?: number; W_t?: number }
  }

  if (!term || !academicYear) {
    return NextResponse.json(
      { error: 'term and academicYear are required' },
      { status: 400 }
    )
  }

  const db = serviceClient()

  // Create the job record
  const { data: job, error: jobErr } = await db
    .from('timetable_jobs')
    .insert({
      school_id: schoolId,
      created_by: userId,
      status: 'queued',
      progress: 0,
      config: {
        term,
        academicYear,
        classes,
        weights: {
          W_c: weights.W_c ?? 1.0,
          W_p: weights.W_p ?? 1.0,
          W_t: weights.W_t ?? 1.0,
        },
      },
    })
    .select('id')
    .single()

  if (jobErr || !job) {
    return NextResponse.json({ error: 'Failed to create job', detail: jobErr?.message }, { status: 500 })
  }

  // Fire the execute route without awaiting — non-blocking background execution
  const origin = new URL(req.url).origin
  const executeUrl = `${origin}/api/timetable/execute?job=${job.id}`
  const internalKey = process.env.TIMETABLE_INTERNAL_KEY ?? 'sychar-internal'

  fetch(executeUrl, {
    method: 'GET',
    headers: { 'x-internal-key': internalKey },
  }).catch(() => {})

  return NextResponse.json({ jobId: job.id }, { status: 202 })
}
