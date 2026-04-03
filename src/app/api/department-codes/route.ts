import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { z } from 'zod'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getClient()
  const { data, error } = await sb
    .from('department_codes')
    .select('*')
    .eq('school_id', auth.schoolId)
    .order('department')

  if (error) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  return NextResponse.json({ departments: data ?? [] })
}

const UpdateSchema = z.object({
  id:   z.string().uuid(),
  code: z.string().min(2).max(10),
})

export async function PUT(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'hod_pathways'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const sb = getClient()
  const { error } = await sb
    .from('department_codes')
    .update({ code: parsed.data.code.toUpperCase(), updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ success: true })
}
