// GET /api/timetable/status/[jobId]
// Returns the job status for a timetable generation job — school-isolated.

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { schoolId } = auth
  const { jobId } = await params

  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 })
  }

  const db = serviceClient()

  const { data: job, error } = await db
    .from('timetable_jobs')
    .select('id, status, progress, config, result_summary, error_message, created_at, started_at, completed_at')
    .eq('id', jobId)
    .eq('school_id', schoolId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({ job })
}
