export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })

  const school_id = form.get('school_id') as string | null
  const file      = form.get('file') as File | null

  if (!school_id || !file) return NextResponse.json({ error: 'school_id and file required' }, { status: 400 })

  const MAX_BYTES = 2 * 1024 * 1024
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File too large (max 2 MB)' }, { status: 413 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext ?? '')) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 415 })
  }

  const db       = adminClient()
  const path     = `logos/${school_id}.${ext}`
  const buffer   = await file.arrayBuffer()

  const { error: uploadError } = await db.storage
    .from('school-assets')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (uploadError) return NextResponse.json({ error: 'Upload failed' }, { status: 500 })

  const { data: { publicUrl } } = db.storage.from('school-assets').getPublicUrl(path)

  await db.from('schools').update({ logo_url: publicUrl }).eq('id', school_id)

  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'design_upload_logo', entity_type: 'school', entity_id: school_id,
    meta: { path, size: file.size },
  })

  return NextResponse.json({ ok: true, logo_url: publicUrl })
}
