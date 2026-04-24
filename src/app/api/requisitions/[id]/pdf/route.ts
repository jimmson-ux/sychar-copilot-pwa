// GET /api/requisitions/[id]/pdf
// Generates the exact Kenyan AIE form PDF via the generate-pdf edge function.
// Returns the public URL of the stored HTML document.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 20)  return ones[n] + ' '
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + ones[n % 10] + ' '
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + convert(n % 100)
    if (n < 1000000) return convert(Math.floor(n / 1000)) + 'Thousand ' + convert(n % 1000)
    return convert(Math.floor(n / 1000000)) + 'Million ' + convert(n % 1000000)
  }

  const whole  = Math.floor(amount)
  const cents  = Math.round((amount - whole) * 100)
  const result = convert(whole).trim() + ' Kenya Shillings'
  return cents > 0 ? result + ` and ${convert(cents).trim()} Cents` : result
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  const { id } = await params
  const db = svc()

  const { data: form, error: fetchErr } = await db
    .from('aie_forms')
    .select('*')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (fetchErr || !form) {
    return NextResponse.json({ error: 'Requisition not found' }, { status: 404 })
  }

  const { data: tenant } = await db
    .from('tenant_configs')
    .select('name, settings')
    .eq('school_id', auth.schoolId!)
    .single()

  type TenantRow = { name: string; settings: Record<string, unknown> }
  const t = tenant as TenantRow | null

  type FormRow = {
    id: string
    form_number: string | null
    requested_by: string
    department: string
    date: string
    tsc_number: string | null
    id_number: string | null
    items: Array<{ description: string; unit: string; quantity: number; amount: number; quantity_fulfilled?: number }>
    total_amount: number
    status: string
    approved_at: string | null
    notes: string | null
  }
  const f = form as FormRow

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // Call generate-pdf edge function
  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/generate-pdf`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      docType: 'aie_requisition',
      data: {
        schoolName:   t?.name ?? 'Secondary School',
        address:      (t?.settings?.['address'] as string) ?? 'P.O. Box, Kenya',
        phone:        (t?.settings?.['phone'] as string) ?? '',
        requestedBy:  f.requested_by,
        date:         f.date,
        department:   f.department,
        tscNumber:    f.tsc_number ?? '—',
        idNumber:     f.id_number ?? '—',
        reqNumber:    f.form_number ?? id.slice(0, 8).toUpperCase(),
        items:        f.items.map((item, i) => ({
          no:        i + 1,
          description: item.description,
          unit:      item.unit,
          quantity:  item.quantity,
          unitPrice: item.amount,
          total:     item.amount * item.quantity,
        })),
        totalAmount:  f.total_amount,
        amountInWords: amountInWords(f.total_amount),
        status:       f.status,
        approvedAt:   f.approved_at,
      },
    }),
  })

  if (!edgeRes.ok) {
    console.error('[requisitions/pdf] edge function failed:', await edgeRes.text())
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 502 })
  }

  const result = await edgeRes.json() as { success: boolean; url?: string; error?: string }

  if (!result.success || !result.url) {
    return NextResponse.json({ error: result.error ?? 'PDF generation failed' }, { status: 500 })
  }

  // Persist URL on the form record
  await db.from('aie_forms').update({ pdf_url: result.url }).eq('id', id)

  return NextResponse.json({ ok: true, pdfUrl: result.url })
}
