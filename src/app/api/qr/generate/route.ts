import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/requireAuth'
import QRCode from 'qrcode'

function getClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const CLASS_NAMES = [
  'Form 3 North', 'Form 3 South', 'Form 3 East', 'Form 3 West',
  'Form 4 North', 'Form 4 South', 'Form 4 East', 'Form 4 West',
  'Grade 10 North', 'Grade 10 South', 'Grade 10 East', 'Grade 10 West',
]

export async function POST() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sychar.vercel.app'
  const sb = getClient()

  const generated: { type: string; label: string; qrDataUrl: string; url: string }[] = []

  // 1. Generate ONE Staffroom duty QR
  const staffroomUrl = `${baseUrl}/duty?station=staffroom&school=${auth.schoolId}`
  const staffroomQr = await QRCode.toDataURL(staffroomUrl, { width: 300, margin: 2 })

  await sb.from('classroom_qr_codes').upsert({
    school_id:  auth.schoolId,
    qr_type:    'duty',
    label:      'Staffroom Duty',
    url:        staffroomUrl,
    qr_data_url: staffroomQr,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'school_id,qr_type,label' })

  generated.push({ type: 'duty', label: 'Staffroom Duty', qrDataUrl: staffroomQr, url: staffroomUrl })

  // 2. Generate classroom QR codes (one per class)
  for (const cls of CLASS_NAMES) {
    const slug = cls.toLowerCase().replace(/\s+/g, '-')
    const clsUrl = `${baseUrl}/record?class=${encodeURIComponent(cls)}`
    const clsQr = await QRCode.toDataURL(clsUrl, { width: 300, margin: 2 })

    await sb.from('classroom_qr_codes').upsert({
      school_id:   auth.schoolId,
      qr_type:     'classroom',
      label:       cls,
      slug,
      url:         clsUrl,
      qr_data_url: clsQr,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'school_id,qr_type,label' })

    generated.push({ type: 'classroom', label: cls, qrDataUrl: clsQr, url: clsUrl })
  }

  return NextResponse.json({ success: true, generated })
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const sb = getClient()
  const { data, error } = await sb
    .from('classroom_qr_codes')
    .select('*')
    .eq('school_id', auth.schoolId)
    .order('qr_type')
    .order('label')

  if (error) return NextResponse.json({ error: 'Failed to load QR codes' }, { status: 500 })

  return NextResponse.json({ qrCodes: data ?? [] })
}
