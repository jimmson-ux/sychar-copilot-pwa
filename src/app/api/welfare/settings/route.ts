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

  const allowed = ['principal', 'guidance_counselling']
  if (!allowed.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const sb = getClient()
  const { data } = await sb
    .from('school_settings')
    .select('share_wellness_nudges_with_parents, welfare_visible_to_dean_students, welfare_visible_to_gerald')
    .eq('school_id', auth.schoolId)
    .single()

  return NextResponse.json({
    shareWellnessNudgesWithParents: data?.share_wellness_nudges_with_parents ?? false,
    welfareVisibleToDeanStudents:   data?.welfare_visible_to_dean_students ?? false,
    welfareVisibleToGerald:         data?.welfare_visible_to_gerald ?? false,
  })
}

const SettingsSchema = z.object({
  shareWellnessNudgesWithParents: z.boolean().optional(),
  welfareVisibleToDeanStudents:   z.boolean().optional(),
  welfareVisibleToGerald:         z.boolean().optional(),
})

export async function PUT(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const allowed = ['principal', 'guidance_counselling']
  if (!allowed.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = SettingsSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const sb = getClient()
  const updates: Record<string, boolean> = {}

  if (parsed.data.shareWellnessNudgesWithParents !== undefined)
    updates.share_wellness_nudges_with_parents = parsed.data.shareWellnessNudgesWithParents
  if (parsed.data.welfareVisibleToDeanStudents !== undefined)
    updates.welfare_visible_to_dean_students = parsed.data.welfareVisibleToDeanStudents
  if (parsed.data.welfareVisibleToGerald !== undefined)
    updates.welfare_visible_to_gerald = parsed.data.welfareVisibleToGerald

  // Upsert school_settings row
  const { error } = await sb
    .from('school_settings')
    .upsert({ school_id: auth.schoolId, ...updates }, { onConflict: 'school_id' })

  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  return NextResponse.json({ success: true })
}
