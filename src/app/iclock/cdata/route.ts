// ZKTeco ADMS / iClock push endpoint.
//   GET  /iclock/cdata?SN=...           -> handshake/config (enables realtime ATTLOG push)
//   POST /iclock/cdata?SN=...&table=ATTLOG  -> attendance rows (TAB-separated text)
// The device sets "Server Address" to this domain; it POSTs each scan automatically
// and handles offline buffering itself. We respond plain "OK" so it clears its queue.
export const dynamic = 'force-dynamic'

import { NextRequest } from 'next/server'
import { svc, resolveDevice, processScans, parseAttlog } from '@/lib/biometric'

function ok(text = 'OK') {
  return new Response(text, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

export async function GET(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') ?? ''
  if (sn) await resolveDevice(svc(), sn).catch(() => null) // touch last_seen
  // Minimal iClock config: enable realtime push, no encryption.
  const config = [
    `GET OPTION FROM: ${sn}`,
    'Stamp=9999',
    'OpStamp=9999',
    'ErrorDelay=30',
    'Delay=10',
    'TransTimes=00:00;23:59',
    'TransInterval=1',
    'TransFlag=1111000000',
    'Realtime=1',
    'Encrypt=0',
  ].join('\n')
  return ok(config)
}

export async function POST(req: NextRequest) {
  const sn = req.nextUrl.searchParams.get('SN') ?? ''
  const table = (req.nextUrl.searchParams.get('table') ?? '').toUpperCase()
  const body = await req.text().catch(() => '')

  // Only ATTLOG carries attendance; ack everything else so the device proceeds.
  if (!sn || table !== 'ATTLOG') return ok()

  const db = svc()
  const device = await resolveDevice(db, sn).catch(() => null)
  if (!device) return ok() // unknown/inactive serial — ack but ignore (must be enrolled first)

  try {
    const scans = parseAttlog(body)
    if (scans.length) await processScans(db, sn, device.school_id, scans)
  } catch (e) {
    console.error('[iclock/cdata] process error:', (e as Error).message)
  }
  return ok()
}
