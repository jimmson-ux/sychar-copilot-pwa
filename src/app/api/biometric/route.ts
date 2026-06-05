// JSON bridge variant of the biometric ingest (for a local agent or non-ADMS device).
// POST /api/biometric  { serial, scans: [{ device_user_id, event_at, status? }] }
//   or single: { serial, device_user_id, event_at, status? }
// Auth: device serial must be registered (+ optional x-device-token matching push_token).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { svc, resolveDevice, processScans, type RawScan } from '@/lib/biometric'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as
    | { serial?: string; scans?: RawScan[]; device_user_id?: string; event_at?: string; status?: string }
    | null
  if (!body?.serial) return NextResponse.json({ error: 'serial required' }, { status: 400 })

  const db = svc()
  const device = await resolveDevice(db, body.serial).catch(() => null)
  if (!device) return NextResponse.json({ error: 'unknown device' }, { status: 401 })

  // Optional per-device shared-secret check (IP is never the trust boundary).
  if (device.push_token) {
    const token = req.headers.get('x-device-token') ?? ''
    if (token !== device.push_token) return NextResponse.json({ error: 'bad device token' }, { status: 401 })
  }

  const scans: RawScan[] = body.scans?.length
    ? body.scans
    : body.device_user_id && body.event_at
      ? [{ device_user_id: body.device_user_id, event_at: body.event_at, status: body.status }]
      : []
  if (!scans.length) return NextResponse.json({ error: 'no scans' }, { status: 400 })

  try {
    const res = await processScans(db, body.serial, device.school_id, scans)
    return NextResponse.json({ ok: true, ...res })
  } catch (e) {
    console.error('[api/biometric] error:', (e as Error).message)
    return NextResponse.json({ error: 'processing error' }, { status: 500 })
  }
}
