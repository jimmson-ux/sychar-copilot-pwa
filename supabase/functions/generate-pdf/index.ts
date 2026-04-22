import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { verifyRequest } from '../_shared/auth.ts'

const ALLOWED_DOC_TYPES = [
  'aie_requisition', 'fee_statement', 'report_card',
  'invigilation_chart', 'duty_roster', 'suspension_letter',
  'merit_list', 'compliance_report',
]

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

function generateDocumentHtml(docType: string, data: Record<string, unknown>): string {
  const school = 'Nkoroi Mixed Day Senior Secondary School'
  return `<html><head><style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #000; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background: #f0f0f0; }
    .signature { margin-top: 40px; }
  </style></head><body>
  <div class="header">
    <h2>${school}</h2>
    <p>Ongata Rongai, Kajiado County | Tel: 0797 652 867</p>
    <h3>${docType.replace(/_/g, ' ').toUpperCase()}</h3>
  </div>
  <pre>${JSON.stringify(data, null, 2)}</pre>
  <div class="signature"><p>Generated: ${new Date().toLocaleDateString('en-KE')}</p></div>
  </body></html>`
}
