import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const ALLOWED_DOC_TYPES = [
  'aie_requisition', 'fee_statement', 'report_card',
  'report_card_cbc', 'report_card_844',
  'invigilation_chart', 'duty_roster', 'suspension_letter',
  'merit_list', 'compliance_report',
]

const CSS = `
  body { font-family: Arial, sans-serif; margin: 30px; color: #000; font-size: 12px; }
  .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
  .header h2 { margin: 0; font-size: 16px; text-transform: uppercase; }
  .header h3 { margin: 4px 0 0; font-size: 13px; }
  .header p  { margin: 2px 0; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { border: 1px solid #000; padding: 5px 7px; text-align: left; }
  th { background: #e8e8e8; font-weight: bold; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin: 10px 0; }
  .info-row { display: flex; gap: 6px; }
  .label { font-weight: bold; white-space: nowrap; }
  .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
  .sig-box { border-top: 1px solid #000; padding-top: 4px; }
  .totals { font-weight: bold; background: #f5f5f5; }
  .grade-key { font-size: 10px; border: 1px solid #ccc; padding: 6px; margin: 8px 0; background: #fafafa; }
  .summary-box { border: 1px solid #000; padding: 8px 12px; margin: 8px 0; display: inline-block; min-width: 160px; }
  .summary-box p { margin: 2px 0; }
  @media print { body { margin: 15px; } }
`

serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }

  try {
    const auth = await verifyRequest(req)
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const { docType, data } = await req.json()

    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return new Response(JSON.stringify({ error: 'Invalid document type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
      })
    }

    const html     = generateDocumentHtml(docType, data)
    const fileName = `${docType}_${auth.userId}_${Date.now()}.html`

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabase.storage
      .from('documents')
      .upload(`${auth.schoolId}/${fileName}`, new Blob([html], { type: 'text/html' }), {
        upsert: false,
        metadata: { docType, generatedBy: auth.userId },
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(`${auth.schoolId}/${fileName}`)

    return new Response(JSON.stringify({ success: true, url: publicUrl }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  } catch (error) {
    console.error('[generate-pdf]', error)
    return new Response(JSON.stringify({ error: 'PDF generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    })
  }
})

// deno-lint-ignore no-explicit-any
function generateDocumentHtml(docType: string, data: Record<string, any>): string {
  if (docType === 'aie_requisition') return aieHtml(data)
  if (docType === 'report_card_cbc') return reportCardCBCHtml(data)
  if (docType === 'report_card_844') return reportCard844Html(data)
  // fallback for legacy docTypes
  return `<html><head><style>${CSS}</style></head><body>
    <div class="header">
      <h2>${data.schoolName ?? ''}</h2>
      <h3>${docType.replace(/_/g,' ').toUpperCase()}</h3>
    </div>
    <pre>${JSON.stringify(data, null, 2)}</pre>
    <p>Generated: ${new Date().toLocaleDateString('en-KE')}</p>
  </body></html>`
}

// deno-lint-ignore no-explicit-any
function aieHtml(d: Record<string, any>): string {
  // deno-lint-ignore no-explicit-any
  const rows = (d.items ?? []).map((item: any, i: number) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.description}</td>
      <td>${item.unit}</td>
      <td>${item.quantity}</td>
      <td>${Number(item.unitPrice).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
      <td>${Number(item.total).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
    </tr>`).join('')

  return `<html><head><style>${CSS}</style></head><body>
  <div class="header">
    <h2>${d.schoolName}</h2>
    <p>${d.address}${d.phone ? ' | Tel: ' + d.phone : ''}</p>
    <h3>AUTHORITY TO INCUR EXPENDITURE (AIE)</h3>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="label">Requested by:</span> ${d.requestedBy}</div>
    <div class="info-row"><span class="label">Date:</span> ${d.date}</div>
    <div class="info-row"><span class="label">Department:</span> ${d.department}</div>
    <div class="info-row"><span class="label">TSC No:</span> ${d.tscNumber}</div>
    <div class="info-row"><span class="label">ID No:</span> ${d.idNumber}</div>
    <div class="info-row"><span class="label">Requisition No:</span> ${d.reqNumber}</div>
  </div>

  <table>
    <thead><tr>
      <th>No</th><th>Description</th><th>Unit</th>
      <th>Quantity</th><th>Unit Price (KSH)</th><th>Total (KSH)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr class="totals">
        <td colspan="5" style="text-align:right">TOTAL AMOUNT:</td>
        <td>KES ${Number(d.totalAmount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tfoot>
  </table>

  <p><strong>Amount in words:</strong> ${d.amountInWords}</p>

  <div style="border:1px solid #000;padding:10px;margin:16px 0">
    <p><strong>FOR INTERNAL USE ONLY</strong></p>
    <div class="info-grid" style="margin-top:8px">
      <div class="info-row"><span class="label">Accounts / Bursar:</span> _______________________ Date: __________</div>
      <div class="info-row"><span class="label">Approved by Principal:</span> _____________________ Date: __________</div>
    </div>
    <div class="info-row" style="margin-top:8px"><span class="label">Signature:</span> ___________________________________</div>
  </div>

  <div style="border:1px solid #000;padding:10px;margin-top:12px">
    <p><em>I confirm that the above goods/services were received in good condition and as specified above.</em></p>
    <div class="info-grid" style="margin-top:8px">
      <div class="info-row"><span class="label">Received by:</span> _______________________</div>
      <div class="info-row"><span class="label">Date:</span> _____________</div>
      <div class="info-row"><span class="label">Sign:</span> ___________________________</div>
    </div>
  </div>
  </body></html>`
}

// deno-lint-ignore no-explicit-any
function reportCardCBCHtml(d: Record<string, any>): string {
  // deno-lint-ignore no-explicit-any
  const subjectRows = (d.subjects ?? []).map((s: any) => `
    <tr>
      <td>${s.name}</td>
      <td>—</td>
      <td>${s.score}%</td>
      <td>${s.grade}</td>
      <td>${s.points}</td>
      <td>${s.remarks}</td>
    </tr>`).join('')

  return `<html><head><style>${CSS}</style></head><body>
  <div class="header">
    <h2>${d.schoolName}</h2>
    <p>KNEC Code: ${d.knecCode || '—'}</p>
    <h3>COMPETENCY BASED EDUCATION — PROGRESS REPORT CARD</h3>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="label">Name:</span> ${d.student?.name}</div>
    <div class="info-row"><span class="label">Adm No:</span> ${d.student?.admissionNo}</div>
    <div class="info-row"><span class="label">Class:</span> ${d.student?.className}</div>
    <div class="info-row"><span class="label">Gender:</span> ${d.student?.gender}</div>
    <div class="info-row"><span class="label">Term:</span> ${d.term}</div>
    <div class="info-row"><span class="label">Year:</span> ${d.academicYear}</div>
  </div>

  <table>
    <thead><tr>
      <th>Subject</th><th>Strand</th><th>Score</th>
      <th>Level</th><th>Points</th><th>Remarks</th>
    </tr></thead>
    <tbody>${subjectRows}</tbody>
  </table>

  <div class="grade-key">
    <strong>Grade Key:</strong>
    EE1 (90–99) = 4.0 | EE2 (75–89) = 3.5 | ME1 (58–74) = 3.0 | ME2 (41–57) = 2.5 |
    AE1 (31–40) = 2.0 | AE2 (21–30) = 1.5 | BE1 (11–20) = 1.0 | BE2 (1–10) = 0.5
  </div>

  <div style="display:flex;gap:20px;flex-wrap:wrap;margin:10px 0">
    <div class="summary-box">
      <p><strong>Total Points:</strong> ${d.totalPoints}</p>
      <p><strong>Average:</strong> ${d.average}</p>
      <p><strong>Mean Level:</strong> ${d.meanGrade}</p>
      <p><strong>Class Position:</strong> ${d.classRank} / ${d.streamRank}</p>
    </div>
    <div class="summary-box">
      <p><strong>Attendance:</strong> ${d.attendance?.present}/${d.attendance?.total} days (${d.attendance?.percentage}%)</p>
      <p><strong>Conduct:</strong> ${d.discipline?.conduct}</p>
    </div>
  </div>

  <div class="sig-row">
    <div class="sig-box">
      <p><strong>Class Teacher Remarks:</strong></p>
      <p>________________________________</p>
      <p>Sign: _________________ Date: _________</p>
    </div>
    <div class="sig-box">
      <p><strong>Principal Remarks:</strong></p>
      <p>________________________________</p>
      <p>Sign: _________________ Date: _________</p>
    </div>
  </div>

  <div style="margin-top:16px">
    <p><strong>Parent / Guardian Signature:</strong> _____________________________ Date: _____________</p>
    <div style="float:right;border:1px solid #999;width:80px;height:60px;text-align:center;padding-top:20px;font-size:10px;color:#999">School Stamp</div>
  </div>
  </body></html>`
}

// deno-lint-ignore no-explicit-any
function reportCard844Html(d: Record<string, any>): string {
  // deno-lint-ignore no-explicit-any
  const subjectRows = (d.subjects ?? []).map((s: any) => `
    <tr>
      <td>${s.name}</td>
      <td>${s.score}</td>
      <td>${s.grade}</td>
      <td>${s.points}</td>
      <td>—</td>
      <td>—</td>
      <td>${s.remarks || '—'}</td>
    </tr>`).join('')

  return `<html><head><style>${CSS}</style></head><body>
  <div class="header">
    <h2>${d.schoolName}</h2>
    <p>KNEC Code: ${d.knecCode || '—'}</p>
    <h3>SECONDARY SCHOOL PROGRESS REPORT — ${d.examType?.toUpperCase()}</h3>
  </div>

  <div class="info-grid">
    <div class="info-row"><span class="label">Name:</span> ${d.student?.name}</div>
    <div class="info-row"><span class="label">Adm No:</span> ${d.student?.admissionNo}</div>
    <div class="info-row"><span class="label">Class:</span> ${d.student?.className}</div>
    <div class="info-row"><span class="label">Stream:</span> ${d.student?.stream || '—'}</div>
    <div class="info-row"><span class="label">Term:</span> ${d.term}</div>
    <div class="info-row"><span class="label">Year:</span> ${d.academicYear}</div>
  </div>

  <table>
    <thead><tr>
      <th>Subject</th><th>Score</th><th>Grade</th><th>Points</th>
      <th>Class Avg</th><th>Position</th><th>Remarks</th>
    </tr></thead>
    <tbody>${subjectRows}</tbody>
  </table>

  <div class="grade-key">
    <strong>Grade Scale:</strong>
    A (81–100) = 12 | A- (74–80) = 11 | B+ (67–73) = 10 | B (60–66) = 9 |
    B- (53–59) = 8 | C+ (46–52) = 7 | C (39–45) = 6 | C- (32–38) = 5 |
    D+ (25–31) = 4 | D (18–24) = 3 | D- (11–17) = 2 | E (0–10) = 1
  </div>

  <div style="display:flex;gap:20px;flex-wrap:wrap;margin:10px 0">
    <div class="summary-box">
      <p><strong>Total Marks:</strong> ${d.subjects?.reduce((s: number, sub: {score: number}) => s + sub.score, 0) ?? 0}</p>
      <p><strong>Mean Score:</strong> ${d.average}</p>
      <p><strong>Mean Grade:</strong> ${d.meanGrade}</p>
      <p><strong>Class Position:</strong> ${d.classRank}</p>
    </div>
    <div class="summary-box">
      <p><strong>Attendance:</strong> ${d.attendance?.present}/${d.attendance?.total} days (${d.attendance?.percentage}%)</p>
      <p><strong>Discipline:</strong> ${d.discipline?.incidents} incident(s) this term</p>
      <p><strong>Conduct:</strong> ${d.discipline?.conduct}</p>
    </div>
  </div>

  <div class="sig-row">
    <div class="sig-box">
      <p><strong>Form Teacher:</strong> _________________________</p>
      <p>Sign: _________________ Date of Issue: _____________</p>
    </div>
    <div class="sig-box">
      <p><strong>Principal:</strong> ____________________________</p>
      <p>Sign: _________________ Next Term: _________________</p>
    </div>
  </div>

  <div style="margin-top:16px">
    <p><strong>Parent Signature:</strong> _____________________________ Date: _____________</p>
    <div style="float:right;border:1px solid #999;width:80px;height:60px;text-align:center;padding-top:20px;font-size:10px;color:#999">School Stamp</div>
  </div>
  </body></html>`
}
