// iClock command poll. The device periodically asks for server commands; we have
// none, so we ack with "OK" (keeps the device happy + marks it alive).
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { svc, resolveDevice } from '@/lib/biometric'

export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') ?? ''
  if (sn) await resolveDevice(svc(), sn).catch(() => null)
  return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })
}
