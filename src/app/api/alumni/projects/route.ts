// GET  /api/alumni/projects — list donation projects with progress
// POST /api/alumni/projects — create a project (principal only)

export const dynamic = 'force-dynamic'

import { createClient }           from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }             from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db = svc()

  const { data: projects, error } = await db
    .from('donation_projects')
    .select('id, title, description, target_amount, raised_amount, status, deadline, created_at')
    .eq('school_id', auth.schoolId!)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (projects ?? []).map((p: {
    id: string; title: string; description: string | null; target_amount: number;
    raised_amount: number; status: string; deadline: string | null; created_at: string;
  }) => ({
    ...p,
    progress_pct: p.target_amount > 0 ? Math.round((p.raised_amount / p.target_amount) * 100) : 0,
  }))

  return NextResponse.json({ projects: enriched })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (auth.subRole !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: principal only' }, { status: 403 })
  }

  const db   = svc()
  const body = await req.json() as {
    title:         string
    description?:  string
    target_amount: number
    deadline?:     string
  }

  if (!body.title || !body.target_amount) {
    return NextResponse.json({ error: 'title and target_amount required' }, { status: 400 })
  }

  const { data: staff } = await db
    .from('staff_records').select('id').eq('user_id', auth.userId!).eq('school_id', auth.schoolId!).single()

  const { data, error } = await db
    .from('donation_projects')
    .insert({
      school_id:     auth.schoolId,
      title:         body.title.trim(),
      description:   body.description?.trim() ?? null,
      target_amount: body.target_amount,
      deadline:      body.deadline ?? null,
      created_by:    (staff as { id: string } | null)?.id ?? null,
    })
    .select('id, title, target_amount')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, project: data })
}
