export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireSuperAdmin, adminClient } from '@/lib/super/requireSuperAdmin'
import { calculateYearlyInvoice } from '@/lib/billing'
import type { School, GlobalPricing } from '@/lib/billing'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const db = adminClient()

  const [schoolsRes, pricingRes] = await Promise.all([
    db.from('schools').select('*, tenant_configs(school_short_code)').order('name'),
    db.from('global_settings').select('addon_pricing').eq('id', 1).single(),
  ])

  if (schoolsRes.error) return NextResponse.json({ error: 'Internal server error' }, { status: 500 })

  const pricing = pricingRes.data?.addon_pricing as GlobalPricing | null

  const schools = (schoolsRes.data as School[]).map(s => {
    const inv = pricing ? calculateYearlyInvoice(s, pricing) : null
    const expires = new Date(s.subscription_expires_at)
    const daysLeft = Math.ceil((expires.getTime() - Date.now()) / 86_400_000)
    return { ...s, invoice: inv, daysLeft }
  })

  const totalARR  = pricing ? schools.reduce((n, s) => n + (s.invoice?.totalYearly ?? 0), 0) : 0
  const activeARR = pricing ? schools.filter(s => s.is_active).reduce((n, s) => n + (s.invoice?.totalYearly ?? 0), 0) : 0

  return NextResponse.json({ schools, pricing, stats: { totalARR, activeARR } })
}
