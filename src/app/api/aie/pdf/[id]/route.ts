// GET /api/aie/pdf/[id]
// Generates a print-ready HTML document for the AIE form.
// Embeds SHA-256 hash of the form data in the footer.
// Stores the HTML in Supabase Storage and returns a signed URL valid 48 hours.
// Server-side only — school_id resolved from authenticated session, never from client.

export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createHash } from 'crypto'

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized
  const { id } = await params

  const db = svc()

  const { data: form, error } = await db
    .from('aie_forms')
    .select('*')
    .eq('id', id)
    .eq('school_id', auth.schoolId!)
    .single()

  if (error || !form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

  // Fetch school name from DB — never hardcoded
  const { data: school } = await db
    .from('schools')
    .select('name, motto, address')
    .eq('id', auth.schoolId!)
    .single()

  type FormRow = {
    id: string; form_number: string; requested_by: string; department: string
    date: string; tsc_number: string | null; id_number: string | null
    items: Array<{ description: string; unit: string; quantity: number; amount: number }>
    total_amount: number; status: string; notes: string | null
    approved_by: string | null; approved_at: string | null
  }
  type SchoolRow = { name: string; motto: string | null; address: string | null }

  const f = form as FormRow
  const sc = (school ?? { name: 'School', motto: null, address: null }) as SchoolRow

  // Compute SHA-256 of the canonical form data
  const canonical = JSON.stringify({
    id:           f.id,
    form_number:  f.form_number,
    requested_by: f.requested_by,
    department:   f.department,
    date:         f.date,
    items:        f.items,
    total_amount: f.total_amount,
    school_id:    auth.schoolId,
  })
  const hash = createHash('sha256').update(canonical).digest('hex')
  const shortHash = hash.slice(0, 16).toUpperCase()

  // Total in words (simple KSH formatter)
  function amountToWords(n: number): string {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
      'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
    if (n === 0) return 'Zero'
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '')
    if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+amountToWords(n%100) : '')
    if (n < 1000000) return amountToWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+amountToWords(n%1000) : '')
    return amountToWords(Math.floor(n/1000000)) + ' Million' + (n%1000000 ? ' '+amountToWords(n%1000000) : '')
  }
  const totalWords = amountToWords(Math.floor(f.total_amount)) + ' Kenya Shillings'
    + (f.total_amount % 1 > 0 ? ` and ${Math.round((f.total_amount % 1) * 100)} Cents` : ' Only')

  const itemRows = (f.items ?? []).map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.description}</td>
      <td>${item.unit}</td>
      <td style="text-align:right">${item.quantity}</td>
      <td style="text-align:right">${item.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
      <td style="text-align:right">${(item.quantity * item.amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIE Form — ${f.form_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; background: #fff; }
  .page { max-width: 210mm; margin: 0 auto; padding: 15mm 18mm; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 14px; }
  .header h1 { font-size: 13pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .header h2 { font-size: 11pt; font-weight: bold; margin-top: 4px; }
  .header p  { font-size: 9pt; color: #333; margin-top: 2px; }
  .form-number { text-align: right; font-size: 10pt; font-weight: bold; margin-bottom: 10px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #000; margin-bottom: 14px; }
  .meta-cell { padding: 5px 8px; border-right: 1px solid #000; border-bottom: 1px solid #000; font-size: 10pt; }
  .meta-cell:nth-child(even) { border-right: none; }
  .meta-cell:nth-last-child(-n+2) { border-bottom: none; }
  .meta-label { font-weight: bold; font-size: 9pt; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #f0f0f0; padding: 6px 8px; text-align: left; font-size: 10pt; border: 1px solid #000; }
  td { padding: 5px 8px; font-size: 10pt; border: 1px solid #ccc; vertical-align: top; }
  .total-row td { font-weight: bold; border-top: 2px solid #000; background: #f8f8f8; }
  .total-words { border: 1px solid #000; padding: 8px 10px; margin-bottom: 14px; font-size: 10pt; }
  .total-words span { font-weight: bold; }
  .internal-use { border: 1px solid #000; padding: 10px; margin-bottom: 14px; }
  .internal-use h3 { font-size: 10pt; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 10px; }
  .sig-block { text-align: center; }
  .sig-line { border-bottom: 1px solid #000; height: 30px; margin-bottom: 4px; }
  .sig-label { font-size: 9pt; }
  .accounts-box { border: 1px solid #000; padding: 10px; margin-bottom: 14px; }
  .accounts-box h3 { font-size: 10pt; font-weight: bold; text-transform: uppercase; margin-bottom: 8px; }
  .footer { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 8pt; color: #555; display: flex; justify-content: space-between; }
  @media print {
    body { font-size: 10pt; }
    .page { padding: 10mm 12mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <h1>Authority to Incur Expenditure (AIE)</h1>
    <h2>${sc.name}</h2>
    ${sc.motto ? `<p>${sc.motto}</p>` : ''}
    ${sc.address ? `<p>${sc.address}</p>` : ''}
  </div>

  <div class="form-number">Form No: ${f.form_number || '—'}</div>

  <div class="meta-grid">
    <div class="meta-cell"><div class="meta-label">Requested By</div>${f.requested_by}</div>
    <div class="meta-cell"><div class="meta-label">Department</div>${f.department}</div>
    <div class="meta-cell"><div class="meta-label">Date</div>${new Date(f.date).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <div class="meta-cell"><div class="meta-label">TSC No.</div>${f.tsc_number ?? '—'}</div>
    <div class="meta-cell" style="grid-column:1/-1"><div class="meta-label">ID No.</div>${f.id_number ?? '—'}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Description</th>
        <th style="width:70px">Unit</th>
        <th style="width:70px;text-align:right">Qty</th>
        <th style="width:100px;text-align:right">Unit Price (KSH)</th>
        <th style="width:110px;text-align:right">Amount (KSH)</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5" style="text-align:right">Total Amount in Kenya Shillings</td>
        <td style="text-align:right">${f.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  <div class="total-words">
    <span>Total Amount in Words:</span> ${totalWords}
  </div>

  ${f.notes ? `<div style="margin-bottom:14px;font-size:10pt;"><b>Notes:</b> ${f.notes}</div>` : ''}

  <div class="internal-use">
    <h3>For Internal Use Only</h3>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Requested By / Signature</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">HOD / Departmental Head</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
    </div>
  </div>

  <div class="accounts-box">
    <h3>Accounts / Bursar</h3>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Accounts / Bursar Signature</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Vote Head / Budget Line</div>
      </div>
    </div>
  </div>

  <div style="border:2px solid #000;padding:10px;margin-bottom:14px">
    <div style="font-size:10pt;font-weight:bold;margin-bottom:8px">Principal's Approval</div>
    <div class="sig-row">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Principal Signature</div>
      </div>
      <div class="sig-block">
        <div class="sig-line" style="padding-top:8px;font-size:9pt;">${f.approved_at ? new Date(f.approved_at).toLocaleDateString('en-KE') : ''}</div>
        <div class="sig-label">Date Approved</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Official Stamp</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Document Hash: ${shortHash} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-KE')}</span>
    <span>Status: ${f.status.toUpperCase()} &nbsp;|&nbsp; ${sc.name} — Sychar SMS</span>
  </div>

</div>
</body>
</html>`

  // Store in Supabase Storage and return signed URL (48hr expiry)
  const storagePath = `aie-forms/${auth.schoolId}/${id}.html`
  const { error: uploadErr } = await db.storage
    .from('documents')
    .upload(storagePath, Buffer.from(html, 'utf8'), {
      contentType:  'text/html; charset=utf-8',
      upsert:       true,
    })

  if (uploadErr) {
    // If storage not configured, return HTML directly
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const { data: signed } = await db.storage
    .from('documents')
    .createSignedUrl(storagePath, 48 * 3600)  // 48 hours

  // Persist hash + URL in aie_forms
  await db.from('aie_forms').update({
    pdf_url:        signed?.signedUrl ?? null,
    pdf_hash:       hash,
    pdf_expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  }).eq('id', id).eq('school_id', auth.schoolId!)

  return NextResponse.json({
    url:        signed?.signedUrl ?? null,
    hash:       shortHash,
    expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
  })
}
