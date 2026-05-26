import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }               from '@/lib/requireAuth'
import { generateClassQRSheet }      from '@/services/studentQR'

export const dynamic = 'force-dynamic'

// GET /api/qr/class/[classId]  — returns printable HTML sheet for whole class
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { classId } = await params
  const html        = await generateClassQRSheet(classId, auth.schoolId)

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
