import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'
import type { ScriptUpload } from '@/lib/types'
import {
  streamToBuffer, sanitize, fmtDate, fmtDateTime, parseArray,
  pageHeader, pageFooter, sectionHeader, twoColTable,
  F_REGULAR, F_BOLD, F_ITALIC,
  MARGIN, CONTENT_W, BORDER, MUTED, ACCENT, CHARCOAL,
  getAuthenticatedMedic,
} from '@/lib/pdf-helpers'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    return await generateMedDecPdf(params.id)
  } catch (err) {
    console.error('[med-dec/pdf] unhandled error:', err)
    return new NextResponse(
      `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    )
  }
}

async function generateMedDecPdf(id: string) {
  const auth = await getAuthenticatedMedic()
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: raw, error } = await supabase
    .from('medication_declarations')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !raw) return new NextResponse('Declaration not found', { status: 404 })

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase.from('businesses').select('name, logo_url').eq('id', raw.business_id).single(),
  ])

  const siteName     = site?.name     || raw.site_id     || ''
  const businessName = business?.name || raw.business_id || ''

  // Fetch business logo for PDF header
  let logoBuffer: Buffer | null = null
  if (business?.logo_url) {
    try {
      const logoRes = await fetch(business.logo_url)
      if (logoRes.ok) logoBuffer = Buffer.from(await logoRes.arrayBuffer())
    } catch { /* continue without logo */ }
  }

  const rawUploads = parseArray<ScriptUpload>(raw.script_uploads)

  // Fetch script image buffers
  const scriptImages: { name: string; buffer: Buffer }[] = []
  for (const upload of rawUploads) {
    try {
      // Med dec scripts are in the 'scripts' bucket (confirm bucket name matches iOS)
      const { data: urlData } = await supabase.storage
        .from('scripts')
        .createSignedUrl(upload.storagePath, 300)

      if (urlData?.signedUrl) {
        const res = await fetch(urlData.signedUrl)
        if (res.ok) {
          const ab = await res.arrayBuffer()
          scriptImages.push({ name: upload.medicationName, buffer: Buffer.from(ab) })
        }
      }
    } catch {
      // Skip failed images
    }
  }

  // Mark exported_at if not already set
  if (!raw.exported_at) {
    await supabase
      .from('medication_declarations')
      .update({ exported_at: new Date().toISOString() })
      .eq('id', id)
  }

  // Build filename
  const fullName  = raw.worker_name?.trim() || 'Unknown'
  const nameParts = fullName.split(/\s+/)
  const surname   = nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName
  const firstname = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const nameStr   = firstname ? `${surname} ${firstname}` : surname
  const dateStr   = raw.submitted_at ? raw.submitted_at.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const filename  = sanitize(`${nameStr} - MedDec - ${dateStr} - ${siteName} - ${businessName}`) + '.pdf'

  const medications = parseArray<{
    id: string; name: string; prescriptionType: string; dosagePerDay: string
    duration: string; medicationClass: string; flaggedForSideEffects: boolean; isLongTerm: boolean
  }>(raw.medications)

  const totalPages = scriptImages.length > 0 ? 3 : 2
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, autoFirstPage: false })
  const bufferPromise = streamToBuffer(doc)

  // ── PAGE 1 ──────────────────────────────────────────────────────────────────
  doc.addPage()
  pageHeader(doc, logoBuffer, 'CONFIDENTIAL MEDICATION DECLARATION')

  doc.font(F_BOLD).fontSize(16).fillColor('#000')
    .text('CONFIDENTIAL MEDICATION DECLARATION', MARGIN, doc.y, { width: CONTENT_W })
  doc.y += 4

  doc.font(F_REGULAR).fontSize(7.5).fillColor('#000')
    .text(
      'This form contains confidential medical information. Access is restricted to authorised medical personnel only.',
      MARGIN, doc.y, { width: CONTENT_W }
    )
  doc.y += 8

  // WORKER DETAILS
  sectionHeader(doc, 'WORKER DETAILS')
  twoColTable(doc, [
    ['FULL NAME',   raw.worker_name  || '—', 'DATE OF BIRTH', raw.worker_dob ? fmtDate(raw.worker_dob) : '—'],
    ['EMPLOYER',    raw.employer     || '—', 'DEPARTMENT',    raw.department || '—'],
    ['JOB TITLE',   raw.job_title    || '—', 'SUBMITTED',     fmtDateTime(raw.submitted_at)],
    ['SITE',        siteName,                'BUSINESS',      businessName],
  ])

  // HEALTH FLAGS
  const hasFlags = raw.has_recent_injury_or_illness || raw.has_side_effects
  sectionHeader(doc, 'HEALTH FLAGS')
  const flagY = doc.y
  doc.rect(MARGIN, flagY, CONTENT_W, hasFlags ? 28 : 20).fill(hasFlags ? '#fff5f5' : '#f9fafb')
  doc.rect(MARGIN, flagY, CONTENT_W, hasFlags ? 28 : 20).stroke(hasFlags ? '#fca5a5' : BORDER)

  if (hasFlags) {
    doc.font(F_BOLD).fontSize(8).fillColor('#dc2626')
      .text('⚠ Attention Required', MARGIN + 6, flagY + 4, { lineBreak: false })
    doc.y = flagY + 14
  }

  const flagLines: string[] = []
  if (raw.has_recent_injury_or_illness) flagLines.push('Worker has a recent injury or illness')
  if (raw.has_side_effects) flagLines.push('Medication may have side effects that affect safety')
  if (!hasFlags) flagLines.push('No health flags reported')

  doc.font(F_REGULAR).fontSize(8).fillColor(hasFlags ? '#7f1d1d' : MUTED)
    .text(flagLines.join('  ·  '), MARGIN + 6, hasFlags ? doc.y : flagY + 6, { width: CONTENT_W - 12 })
  doc.y = flagY + (hasFlags ? 28 : 20) + 5
  doc.fillColor('#000')

  // MEDICATIONS
  sectionHeader(doc, 'MEDICATIONS')

  if (medications.length === 0) {
    const noMedY = doc.y
    doc.rect(MARGIN, noMedY, CONTENT_W, 18).stroke(BORDER)
    doc.font(F_REGULAR).fontSize(8.5).fillColor(MUTED)
      .text('No medications declared', MARGIN + 5, noMedY + 5, { width: CONTENT_W - 10 })
    doc.fillColor('#000')
    doc.y = noMedY + 18 + 5
  } else {
    // Table header
    const cols = [
      CONTENT_W * 0.22, // Name
      CONTENT_W * 0.14, // Prescription Type
      CONTENT_W * 0.13, // Dosage/Day
      CONTENT_W * 0.13, // Duration
      CONTENT_W * 0.22, // Class
      CONTENT_W * 0.16, // Flagged
    ]
    const headers = ['MEDICATION', 'PRESC. TYPE', 'DOSAGE/DAY', 'DURATION', 'CLASS', 'FLAGGED']
    const tY = doc.y
    let tx = MARGIN

    for (let i = 0; i < headers.length; i++) {
      doc.rect(tx, tY, cols[i], 14).fillAndStroke('#ebebeb', '#cccccc')
      doc.fillColor('#000').font(F_BOLD).fontSize(6.5)
        .text(headers[i], tx + 3, tY + 4, { width: cols[i] - 6, lineBreak: false })
      tx += cols[i]
    }
    doc.y = tY + 14

    for (const med of medications) {
      const rY = doc.y
      tx = MARGIN
      const rh = 14
      const flagged = med.flaggedForSideEffects
      const cells = [
        med.name || '—',
        med.prescriptionType || '—',
        med.dosagePerDay || '—',
        med.duration || '—',
        med.medicationClass || '—',
        flagged ? 'Yes ⚠' : 'No',
      ]

      if (flagged) {
        doc.rect(MARGIN, rY, CONTENT_W, rh).fillAndStroke('#fff7ed', '#cccccc')
      }

      for (let i = 0; i < cells.length; i++) {
        doc.rect(tx, rY, cols[i], rh).stroke('#cccccc')
        const isFlagCol = i === 5
        const color = (isFlagCol && flagged) ? ACCENT : '#000'
        const weight = (isFlagCol && flagged) ? F_BOLD : F_REGULAR
        doc.fillColor(color).font(weight).fontSize(7.5)
          .text(cells[i], tx + 3, rY + 3.5, { width: cols[i] - 6, lineBreak: false })
        tx += cols[i]
      }
      doc.fillColor('#000')
      doc.y = rY + rh
    }

    if (scriptImages.length > 0) {
      doc.y += 3
      doc.font(F_ITALIC).fontSize(7).fillColor(MUTED)
        .text('ℹ Prescription script images attached on page 3.', MARGIN + 5, doc.y, { width: CONTENT_W - 10 })
      doc.fillColor('#000')
    }
    doc.y += 5
  }

  pageFooter(doc, 1, totalPages)

  // ── PAGE 2 — MEDIC REVIEW ────────────────────────────────────────────────
  doc.addPage()
  pageHeader(doc, logoBuffer, 'CONFIDENTIAL MEDICATION DECLARATION')

  sectionHeader(doc, 'MEDIC REVIEW')

  const reviewStatus  = raw.medic_review_status || 'Pending'
  const reviewedAt    = raw.medic_reviewed_at
  const medicName     = raw.medic_name || '—'
  const furtherReview = raw.review_required ? 'Yes' : 'No'

  twoColTable(doc, [
    ['OUTCOME',      reviewStatus,                    'MEDIC',         medicName],
    ['REVIEWED AT',  reviewedAt ? fmtDateTime(reviewedAt) : '—', 'FURTHER REVIEW', furtherReview],
    ['EXPORTED',     fmtDateTime(raw.exported_at || new Date().toISOString())],
  ])

  if (raw.medic_comments) {
    sectionHeader(doc, 'MEDIC COMMENTS')
    const commentY = doc.y
    doc.rect(MARGIN, commentY, CONTENT_W, Math.max(40, 12 + raw.medic_comments.length * 0.4)).stroke(BORDER)
    doc.font(F_REGULAR).fontSize(8.5).fillColor('#000')
      .text(raw.medic_comments, MARGIN + 6, commentY + 6, { width: CONTENT_W - 12 })
    doc.y = commentY + Math.max(40, 12 + raw.medic_comments.length * 0.4) + 5
  }

  // Outcome colour band
  const STATUS_COLORS: Record<string, string> = {
    'Normal Duties':    '#dcfce7',
    'Restricted Duties': '#fef9c3',
    'Unfit for Work':   '#fee2e2',
    'Pending':          '#f1f5f9',
  }
  const STATUS_TEXT: Record<string, string> = {
    'Normal Duties':    '#166534',
    'Restricted Duties': '#713f12',
    'Unfit for Work':   '#7f1d1d',
    'Pending':          '#475569',
  }

  doc.y += 10
  const bandY = doc.y
  doc.rect(MARGIN, bandY, CONTENT_W, 32).fill(STATUS_COLORS[reviewStatus] || '#f1f5f9')
  doc.rect(MARGIN, bandY, CONTENT_W, 32).stroke(BORDER)
  doc.font(F_BOLD).fontSize(14).fillColor(STATUS_TEXT[reviewStatus] || '#000')
    .text(reviewStatus.toUpperCase(), MARGIN, bandY + 9, { width: CONTENT_W, align: 'center', lineBreak: false })
  doc.y = bandY + 32 + 8
  doc.fillColor('#000')

  // Confidentiality notice
  const noticeY = doc.y + 10
  doc.rect(MARGIN, noticeY, CONTENT_W, 30).fill(CHARCOAL)
  doc.font(F_BOLD).fontSize(7.5).fillColor('#ffffff')
    .text('CONFIDENTIALITY NOTICE', MARGIN + 6, noticeY + 4, { lineBreak: false })
  doc.font(F_REGULAR).fontSize(6.5).fillColor('#cbd5e1')
    .text(
      'This document contains sensitive personal health information. It must be stored securely and only accessed by authorised personnel.',
      MARGIN + 6, noticeY + 14, { width: CONTENT_W - 12 }
    )
  doc.y = noticeY + 30

  pageFooter(doc, 2, totalPages)

  // ── PAGE 3 — SCRIPT IMAGES (optional) ────────────────────────────────────
  if (scriptImages.length > 0) {
    doc.addPage()
    pageHeader(doc, logoBuffer, 'CONFIDENTIAL MEDICATION DECLARATION')
    sectionHeader(doc, 'PRESCRIPTION SCRIPTS')

    doc.font(F_REGULAR).fontSize(8).fillColor(MUTED)
      .text('Copies of prescription scripts provided by the worker.', MARGIN, doc.y, { width: CONTENT_W })
    doc.y += 8
    doc.fillColor('#000')

    const imgW = (CONTENT_W - 16) / 2
    let col = 0
    let rowTop = doc.y

    for (const { name, buffer } of scriptImages) {
      const x = MARGIN + col * (imgW + 16)

      doc.font(F_BOLD).fontSize(8).fillColor('#000')
        .text(name, x, doc.y, { width: imgW, lineBreak: false })
      const imgY = doc.y + 12

      try {
        doc.image(buffer, x, imgY, { fit: [imgW, 280] })
      } catch {
        doc.font(F_ITALIC).fontSize(8).fillColor(MUTED)
          .text('[Image could not be embedded]', x, imgY)
        doc.fillColor('#000')
      }

      if (col === 0) {
        col = 1
        doc.y = rowTop
      } else {
        col = 0
        rowTop = imgY + 285
        doc.y = rowTop
      }
    }

    if (col === 1) doc.y = rowTop + 285

    pageFooter(doc, 3, totalPages)
  }

  doc.end()
  const pdfBuffer = await bufferPromise

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
      'Cache-Control': 'no-store',
    },
  })
}
