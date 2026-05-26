import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }               from '@/lib/requireAuth'
import { generateQRCard }            from '@/services/studentQR'

export const dynamic = 'force-dynamic'

// GET /api/qr/student/[id]  — returns printable HTML QR card for one student
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const html   = await generateQRCard(id, auth.schoolId)

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
