import crypto  from 'crypto'
import QRCode  from 'qrcode'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Generate HMAC token + QR data URL for a student ──────────────
// Token: HMAC-SHA256(studentId:schoolId, STUDENT_QR_SECRET) first 32 chars
// Stored on students.qr_token; printed on student QR card.

export async function generateStudentQRToken(
  studentId: string,
  schoolId:  string
): Promise<{ token: string; qrDataUrl: string }> {
  const secret = process.env.STUDENT_QR_SECRET!
  const token  = crypto
    .createHmac('sha256', secret)
    .update(`${studentId}:${schoolId}`)
    .digest('hex')
    .slice(0, 32)

  const admin = getAdmin()
  await admin
    .from('students')
    .update({ qr_token: token })
    .eq('id', studentId)
    .eq('school_id', schoolId)

  const qrDataUrl = await QRCode.toDataURL(token, {
    width:  220,
    margin: 2,
    color:  { dark: '#8B0000', light: '#FFFFFF' },
  })

  return { token, qrDataUrl }
}

// ── Generate printable QR card HTML (credit-card size) ───────────

export async function generateQRCard(
  studentId: string,
  schoolId:  string
): Promise<string> {
  const admin = getAdmin()

  const { data: student } = await admin
    .from('students')
    .select('full_name, admission_number, class_name, qr_token')
    .eq('id', studentId)
    .eq('school_id', schoolId)
    .maybeSingle()

  if (!student) return '<p>Student not found</p>'

  let qrDataUrl: string
  if (student.qr_token) {
    qrDataUrl = await QRCode.toDataURL(student.qr_token, {
      width: 160, margin: 1, color: { dark: '#8B0000', light: '#FFFFFF' },
    })
  } else {
    const result = await generateStudentQRToken(studentId, schoolId)
    qrDataUrl = result.qrDataUrl
  }

  const { data: school } = await admin
    .from('schools')
    .select('name, short_name')
    .eq('id', schoolId)
    .maybeSingle()

  const schoolName = school?.name ?? 'School'

  return `
<div style="
  width:85.6mm;height:54mm;
  border:1.5px solid #8B0000;
  border-radius:4px;
  padding:4mm;
  font-family:sans-serif;
  display:flex;
  gap:4mm;
  align-items:center;
  background:#fff;
  box-sizing:border-box;
">
  <img src="${qrDataUrl}" width="90" height="90" style="flex-shrink:0"/>
  <div style="flex:1;overflow:hidden">
    <div style="font-size:7px;color:#8B0000;font-weight:bold;text-transform:uppercase;letter-spacing:.5px">
      ${schoolName}
    </div>
    <div style="font-size:11px;font-weight:bold;margin-top:2mm;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
      ${student.full_name}
    </div>
    <div style="font-size:9px;color:#555;margin-top:1mm">
      Adm: ${student.admission_number ?? '—'}
    </div>
    <div style="font-size:9px;color:#555">
      Class: ${student.class_name ?? '—'}
    </div>
    <div style="font-size:7px;color:#aaa;margin-top:3mm;font-family:monospace">
      ${(student.qr_token ?? '').slice(0, 8).toUpperCase()}
    </div>
  </div>
</div>`
}

// ── Generate printable class QR sheet ────────────────────────────
// Returns an HTML document with all student cards for a class.

export async function generateClassQRSheet(
  classId:  string,
  schoolId: string
): Promise<string> {
  const admin = getAdmin()

  const { data: students } = await admin
    .from('students')
    .select('id, full_name, admission_number, class_name, qr_token')
    .eq('school_id', schoolId)
    .or(`class_id.eq.${classId},class_name.eq.${classId}`)
    .eq('is_active', true)
    .order('full_name')

  if (!students?.length) return '<p>No students found for this class.</p>'

  const cards: string[] = []

  for (const s of students) {
    let qrDataUrl: string
    if (s.qr_token) {
      qrDataUrl = await QRCode.toDataURL(s.qr_token, {
        width: 160, margin: 1, color: { dark: '#8B0000', light: '#FFFFFF' },
      })
    } else {
      const result = await generateStudentQRToken(s.id, schoolId)
      qrDataUrl = result.qrDataUrl
    }

    cards.push(`
<div style="
  display:inline-flex;
  width:85.6mm;height:54mm;
  border:1px solid #ccc;
  border-radius:3px;
  padding:3mm;
  font-family:sans-serif;
  gap:3mm;
  align-items:center;
  margin:2mm;
  box-sizing:border-box;
  vertical-align:top;
">
  <img src="${qrDataUrl}" width="80" height="80" style="flex-shrink:0"/>
  <div>
    <div style="font-size:10px;font-weight:bold;color:#111">${s.full_name}</div>
    <div style="font-size:8px;color:#555">Adm: ${s.admission_number ?? '—'}</div>
    <div style="font-size:8px;color:#555">${s.class_name ?? classId}</div>
    <div style="font-size:7px;color:#bbb;font-family:monospace;margin-top:2mm">${(s.qr_token ?? '').slice(0, 8).toUpperCase()}</div>
  </div>
</div>`)
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>QR Cards — ${classId}</title>
  <style>
    @media print { body { margin: 0; } }
    body { background: #fff; }
    h2 { font-family:sans-serif; font-size:14px; color:#8B0000; padding:4mm; }
  </style>
</head>
<body>
  <h2>Student QR Cards — ${classId} (${students.length} students)</h2>
  ${cards.join('\n')}
</body>
</html>`
}
