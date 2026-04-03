// GET  /api/department-codes/qr  — returns departments with pre-generated QR data URLs
// POST /api/department-codes/qr  — regenerates QR token for a specific department

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import { randomBytes } from 'crypto'
import QRCode from 'qrcode'
import { z } from 'zod'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://project-o7htk.vercel.app'

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
  const { data: depts, error } = await sb
    .from('department_codes')
    .select('id, department, code, subjects, color_primary, color_secondary, is_active, qr_token, qr_url')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)
    .order('department')

  if (error) return NextResponse.json({ error: 'Failed to load departments' }, { status: 500 })

  // Generate QR data URLs for each department (or regenerate if missing)
  const results = await Promise.all(
    (depts ?? []).map(async dept => {
      let token = dept.qr_token as string | null
      let qrUrl = dept.qr_url as string | null

      // Generate token if missing
      if (!token) {
        token = randomBytes(32).toString('hex')
        qrUrl = `${BASE_URL}/record?dept=${token}`
        await sb.from('department_codes')
          .update({ qr_token: token, qr_url: qrUrl })
          .eq('id', dept.id)
      }

      const qrDataUrl = await QRCode.toDataURL(qrUrl!, { width: 280, margin: 1, color: { dark: dept.color_primary } })

      return {
        id:             dept.id,
        department:     dept.department,
        code:           dept.code,
        subjects:       dept.subjects,
        colorPrimary:   dept.color_primary,
        colorSecondary: dept.color_secondary,
        qrDataUrl,
        qrUrl:          qrUrl!,
      }
    })
  )

  return NextResponse.json({ departments: results })
}

const RegenerateSchema = z.object({ deptId: z.string().uuid() })

export async function POST(request: Request) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  if (!['principal', 'hod_pathways'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RegenerateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', detail: parsed.error.flatten() }, { status: 400 })
  }

  const sb = getClient()
  const newToken = randomBytes(32).toString('hex')
  const newQrUrl = `${BASE_URL}/record?dept=${newToken}`

  const { error } = await sb
    .from('department_codes')
    .update({ qr_token: newToken, qr_url: newQrUrl, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.deptId)
    .eq('school_id', auth.schoolId)

  if (error) return NextResponse.json({ error: 'Failed to regenerate' }, { status: 500 })

  // Generate new QR image
  const { data: dept } = await sb
    .from('department_codes')
    .select('department, code, color_primary, color_secondary')
    .eq('id', parsed.data.deptId)
    .single()

  const qrDataUrl = dept
    ? await QRCode.toDataURL(newQrUrl, { width: 280, margin: 1, color: { dark: dept.color_primary } })
    : null

  return NextResponse.json({ success: true, qrDataUrl, qrUrl: newQrUrl })
}
