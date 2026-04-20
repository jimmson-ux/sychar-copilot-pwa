import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/requireAuth'
import { createAdminSupabaseClient } from '@/lib/supabase-server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import QRCode from 'qrcode'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/students/qr-sheet?class_id=xxx
 *
 * Generates a printable PDF of student QR ID cards.
 * Layout: 8 cards per A4 page (2 columns × 4 rows), CR80 card proportions.
 * Each card shows:
 *   - School name
 *   - QR code (signed_payload encoded)
 *   - Virtual QR ID (XXXX-XXXX) printed below QR
 *   - "Sychar CoPilot" branding
 *   - NO student name, class, or admission number
 *
 * Auth: principal or admin only
 * Optional: ?class_id=xxx  — limit to one class; omit for all active students
 */

// A4 in points (72 pt/inch)
const A4_W = 595.28
const A4_H = 841.89

// Card dimensions — 2 cols × 4 rows with margins
const MARGIN_X  = 30
const MARGIN_Y  = 30
const GAP_X     = 15
const GAP_Y     = 15
const CARD_W    = (A4_W - 2 * MARGIN_X - GAP_X)  / 2   // ~257 pt
const CARD_H    = (A4_H - 2 * MARGIN_Y - 3 * GAP_Y) / 4 // ~191 pt
const QR_SIZE   = 100   // pt

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.unauthorized) return auth.unauthorized

  if (!['principal', 'super_admin', 'admin'].includes(auth.subRole)) {
    return NextResponse.json({ error: 'Principal access required' }, { status: 403 })
  }

  const classId = req.nextUrl.searchParams.get('class_id')
  const svc     = createAdminSupabaseClient()

  // Fetch school metadata for branding
  const { data: meta } = await svc
    .from('school_metadata')
    .select('name, short_name, short_code')
    .eq('school_id', auth.schoolId)
    .single()

  if (!meta) return NextResponse.json({ error: 'School metadata missing' }, { status: 500 })

  // Fetch active QR tokens
  let query = svc
    .from('student_qr_tokens')
    .select('virtual_qr_id, signed_payload, student_id')
    .eq('school_id', auth.schoolId)
    .eq('is_active', true)

  if (classId) {
    // Filter by class via students join
    const { data: classStudents } = await svc
      .from('students')
      .select('id')
      .eq('class_id', classId)
      .eq('school_id', auth.schoolId)
    const ids = (classStudents ?? []).map((s: { id: string }) => s.id)
    if (!ids.length) return NextResponse.json({ error: 'No students in this class' }, { status: 404 })
    query = query.in('student_id', ids)
  }

  const { data: tokens, error } = await query.order('virtual_qr_id')
  if (error || !tokens?.length) {
    return NextResponse.json({ error: 'No QR tokens found. Run generate-qr-codes first.' }, { status: 404 })
  }

  // Build PDF
  const pdf   = await PDFDocument.create()
  const font  = await pdf.embedFont(StandardFonts.HelveticaBold)
  const fontR = await pdf.embedFont(StandardFonts.Helvetica)

  const schoolLabel = (meta.short_name || meta.name) as string
  const brandLabel  = 'Sychar CoPilot'

  let page     = pdf.addPage([A4_W, A4_H])
  let cardIdx  = 0

  for (const token of tokens) {
    if (cardIdx > 0 && cardIdx % 8 === 0) {
      page = pdf.addPage([A4_W, A4_H])
    }

    const pos    = cardIdx % 8
    const col    = pos % 2
    const row    = Math.floor(pos / 2)
    const x      = MARGIN_X + col * (CARD_W + GAP_X)
    const y      = A4_H - MARGIN_Y - (row + 1) * CARD_H - row * GAP_Y

    // Card border
    page.drawRectangle({
      x, y,
      width:       CARD_W,
      height:      CARD_H,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
      color:       rgb(1, 1, 1),
    })

    // School name header band
    page.drawRectangle({
      x, y: y + CARD_H - 22,
      width: CARD_W, height: 22,
      color: rgb(0.12, 0.25, 0.69),  // #1e40af
    })
    page.drawText(schoolLabel, {
      x:     x + 6,
      y:     y + CARD_H - 15,
      size:  8,
      font,
      color: rgb(1, 1, 1),
      maxWidth: CARD_W - 12,
    })

    // Generate QR code as PNG buffer
    const qrBuffer = await QRCode.toBuffer(token.signed_payload as string, {
      width:  QR_SIZE * 2,
      margin: 1,
      color:  { dark: '#000000', light: '#ffffff' },
    })
    const qrImage = await pdf.embedPng(qrBuffer)
    const qrX = x + (CARD_W - QR_SIZE) / 2
    const qrY = y + CARD_H - 22 - QR_SIZE - 10

    page.drawImage(qrImage, { x: qrX, y: qrY, width: QR_SIZE, height: QR_SIZE })

    // Virtual QR ID below QR
    const qrIdText = token.virtual_qr_id as string
    const qrIdW    = font.widthOfTextAtSize(qrIdText, 11)
    page.drawText(qrIdText, {
      x:    x + (CARD_W - qrIdW) / 2,
      y:    qrY - 14,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.1),
    })

    // Branding footer
    const brandW = fontR.widthOfTextAtSize(brandLabel, 7)
    page.drawText(brandLabel, {
      x:    x + (CARD_W - brandW) / 2,
      y:    y + 6,
      size: 7,
      font: fontR,
      color: rgb(0.6, 0.6, 0.6),
    })

    cardIdx++
  }

  // Mark printed_at on tokens
  await svc
    .from('student_qr_tokens')
    .update({ printed_at: new Date().toISOString() })
    .in('virtual_qr_id', tokens.map(t => t.virtual_qr_id))

  const pdfBytes = await pdf.save()

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="qr-cards-${meta.short_code}-${Date.now()}.pdf"`,
      'Content-Length':      String(pdfBytes.byteLength),
    },
  })
}
