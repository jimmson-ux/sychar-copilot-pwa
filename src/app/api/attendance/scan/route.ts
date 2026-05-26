import { NextRequest, NextResponse } from 'next/server'
import { requireAuth }               from '@/lib/requireAuth'
import { processQRScan }             from '@/services/qrAttendance'

export const dynamic = 'force-dynamic'

// POST /api/attendance/scan
// Body: { studentQRToken: string, deviceInfo?: string }
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  let body: { studentQRToken: string; deviceInfo?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.studentQRToken) {
    return NextResponse.json({ error: 'studentQRToken required' }, { status: 400 })
  }

  const result = await processQRScan({
    studentQRToken: body.studentQRToken,
    teacherId:      auth.userId,
    schoolId:       auth.schoolId,
    deviceInfo:     body.deviceInfo,
  })

  const httpStatus = result.success ? 200 : result.status === 'Duplicate' ? 409 : 400
  return NextResponse.json(result, { status: httpStatus })
}
