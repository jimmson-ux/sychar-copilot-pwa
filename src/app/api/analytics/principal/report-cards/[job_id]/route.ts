// GET /api/analytics/principal/report-cards/:job_id
// Poll job status for report card generation

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> },
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const { job_id } = await params

  const db = admin()

  const { data: job, error } = await db
    .from('report_card_jobs')
    .select('id, status, progress, report_count, cbc_count, legacy_count, download_url, error_message, completed_at')
    .eq('id', job_id)
    .eq('school_id', auth.schoolId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    status:        job.status,
    progress:      job.progress,
    download_url:  job.download_url ?? null,
    report_count:  job.report_count,
    cbc_count:     job.cbc_count,
    legacy_count:  job.legacy_count,
    error_message: job.error_message ?? null,
    completed_at:  job.completed_at ?? null,
  })
}
