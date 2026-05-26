import { NextRequest, NextResponse }  from 'next/server'
import { requireAuth }                from '@/lib/requireAuth'
import { generateStudentQRToken }     from '@/services/studentQR'

export const dynamic = 'force-dynamic'

// POST /api/qr/regenerate/[studentId]  — issue a new QR token (lost card)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const ALLOWED = ['principal','deputy_principal','dean_of_studies','super_admin','teacher','hod']
  if (!ALLOWED.includes(auth.subRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId } = await params
  const { token, qrDataUrl } = await generateStudentQRToken(studentId, auth.schoolId)

  return NextResponse.json({ studentId, token: token.slice(0, 8).toUpperCase(), qrDataUrl })
}
