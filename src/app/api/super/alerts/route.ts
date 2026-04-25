export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db  = adminClient()
  const now = new Date()

  const [schoolsRes, logsRes] = await Promise.all([
    db.from('schools').select('id, name, is_active, subscription_expires_at'),
    db.from('god_mode_audit').select('action, created_at').order('created_at', { ascending: false }).limit(200),
  ])

  const alerts: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; detail: string; at: string }[] = []

  for (const s of (schoolsRes.data ?? [])) {
    if (!s.is_active) continue
    const daysLeft = Math.ceil((new Date(s.subscription_expires_at).getTime() - now.getTime()) / 86_400_000)
    if (daysLeft < 0) {
      alerts.push({ id: `exp-${s.id}`, severity: 'critical', title: 'Subscription expired', detail: `${s.name} expired ${Math.abs(daysLeft)}d ago`, at: s.subscription_expires_at })
    } else if (daysLeft <= 14) {
      alerts.push({ id: `exp-${s.id}`, severity: 'warning', title: 'Subscription expiring soon', detail: `${s.name} expires in ${daysLeft} days`, at: s.subscription_expires_at })
    }
  }

  const errorLogs = (logsRes.data ?? []).filter(l => l.action?.startsWith('error_'))
  if (errorLogs.length > 10) {
    alerts.push({ id: 'errors', severity: 'warning', title: 'High error rate', detail: `${errorLogs.length} error events in recent logs`, at: now.toISOString() })
  }

  alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })

  return NextResponse.json({ alerts, checkedAt: now.toISOString() })
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const { title, detail, severity } = await req.json().catch(() => ({}))
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const db = adminClient()
  void db.from('god_mode_audit').insert({
    actor_id: auth.ctx.userId, actor_email: auth.ctx.email,
    action: 'manual_alert', entity_type: 'system', entity_id: null,
    meta: { title, detail, severity: severity ?? 'info' },
  })

  return NextResponse.json({ ok: true })
}
