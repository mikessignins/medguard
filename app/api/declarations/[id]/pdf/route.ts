import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import PDFDocument from 'pdfkit'
import type { WorkerSnapshot, Decision, ScriptUpload } from '@/lib/types'
import {
  streamToBuffer, sanitize, fmtDate, fmtDateTime, parseJson, parseArray,
  pageHeader, pageFooter, sectionHeader, twoColTable, questionBlock,
  F_REGULAR, F_BOLD, F_ITALIC,
  MARGIN, CONTENT_W, BORDER, MUTED, ACCENT,
  getAuthenticatedMedic,
} from '@/lib/pdf-helpers'

// PDFKit requires Node.js runtime — not compatible with Vercel Edge
export const runtime = 'nodejs'

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    return await generatePdf(params.id)
  } catch (err) {
    console.error('[pdf/route] unhandled error:', err)
    return new NextResponse(
      `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 }
    )
  }
}

async function generatePdf(id: string) {
  // 1. Auth — must be a signed-in medic
  const auth = await getAuthenticatedMedic()
  if (!auth) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 2. Fetch data using service role (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: raw, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !raw) {
    return new NextResponse('Declaration not found', { status: 404 })
  }

  // 3. Parallel lookups
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

  // 4. Parse snapshot / decision / scripts
  const ws         = parseJson<WorkerSnapshot>(raw.worker_snapshot)
  const decision   = parseJson<Decision>(raw.decision)
  const rawUploads = parseArray<ScriptUpload>(raw.script_uploads)

  // 5. Fetch script image buffers server-side so PDFKit can embed them
  const scriptImages: { name: string; buffer: Buffer }[] = []
  for (const upload of rawUploads) {
    try {
      const { data: urlData } = await supabase.storage
        .from('scripts')
        .createSignedUrl(upload.storagePath, 300) // 5-min expiry is enough

      if (urlData?.signedUrl) {
        const res = await fetch(urlData.signedUrl)
        if (res.ok) {
          const ab = await res.arrayBuffer()
          scriptImages.push({ name: upload.medicationName, buffer: Buffer.from(ab) })
        }
      }
    } catch {
      // Skip if image fetch fails — don't abort the whole PDF
    }
  }

  // 6. Mark exported_at if not already set
  if (!raw.exported_at) {
    await supabase
      .from('submissions')
      .update({ exported_at: new Date().toISOString() })
      .eq('id', raw.id)
  }

  // 7. Build filename
  const fullName   = ws?.fullName?.trim() || 'Unknown'
  const nameParts  = fullName.split(/\s+/)
  const surname    = nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName
  const firstname  = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : ''
  const nameStr    = firstname ? `${surname} ${firstname}` : surname
  const dateStr    = raw.visit_date ? raw.visit_date.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const filename   = sanitize(`${nameStr} - ${dateStr} - ${siteName} - ${businessName}`) + '.pdf'

  // 8. Generate PDF
  const totalPages = scriptImages.length > 0 ? 3 : 2
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, autoFirstPage: false })
  const bufferPromise = streamToBuffer(doc)

  const medications     = ws?.currentMedications || []
  const conditions      = ws?.conditionChecklist ? Object.entries(ws.conditionChecklist) : []
  const conditionHalf   = Math.ceil(conditions.length / 2)
  const condCol1        = conditions.slice(0, conditionHalf)
  const condCol2        = conditions.slice(conditionHalf)
  const disclosed       = conditions.filter(([, v]) => v?.answer === true)

  // ── PAGE 1 ──────────────────────────────────────────────────────────────────
  doc.addPage()
  pageHeader(doc, logoBuffer)

  // Title
  doc.font(F_BOLD).fontSize(18).fillColor('#000')
    .text('EMERGENCY MEDICAL INFORMATION FORM', MARGIN, doc.y, { width: CONTENT_W })
  doc.y += 2

  // Intro
  doc.font(F_REGULAR).fontSize(7.5).fillColor('#000')
    .text(
      'Please complete this form truthfully and honestly as this will be used to assist the emergency management team. ' +
      'This information could save your life in the event of an emergency. ',
      MARGIN, doc.y, { width: CONTENT_W, continued: true }
    )
  doc.font(F_BOLD).fillColor(ACCENT)
    .text('If any conditions on this form change at any time, you must notify the site Emergency Services Officers or Medics.')
  doc.fillColor('#000')
  doc.y += 5

  // PERSONAL DETAILS
  sectionHeader(doc, 'PERSONAL DETAILS')
  twoColTable(doc, [
    ['FULL NAME',    ws?.fullName || '—',       'DATE OF BIRTH', ws?.dateOfBirth ? ws.dateOfBirth.slice(0, 10) : '—'],
    ['EMAIL',        ws?.emailAddress || '—',   'MOBILE',        ws?.mobileNumber || '—'],
    ['COMPANY',      ws?.company || businessName || '—', 'DEPARTMENT', ws?.department || '—'],
    ['SUPERVISOR',   ws?.supervisor || '—',     'SITE LOCATION', ws?.siteLocation || siteName || '—'],
    ['EMPLOYEE ID',  ws?.employeeId || '—',     'CONTRACTOR',    ws?.isContractor ? 'Yes' : 'No'],
    ['HEIGHT',       ws?.heightCm ? `${ws.heightCm} cm` : '—', 'WEIGHT', ws?.weightKg ? `${ws.weightKg} kg` : '—'],
  ])

  // EMERGENCY CONTACT
  sectionHeader(doc, 'EMERGENCY CONTACT')
  twoColTable(doc, [
    ['FULL NAME',     ws?.emergencyContactName   || '—', 'RELATIONSHIP', ws?.emergencyContactRelationship || ws?.emergencyContactOther || '—'],
    ['MOBILE NUMBER', ws?.emergencyContactMobile || '—'],
  ])

  // MEDICAL HISTORY
  sectionHeader(doc, 'MEDICAL HISTORY')

  // Allergies
  questionBlock(doc, 'DO YOU HAVE ANY KNOWN ALLERGIES TO MEDICATIONS, FOOD, CHEMICALS, ANIMALS, INSECTS ETC.? IF YES, ARE YOU ANAPHYLACTIC?', () => {
    const text = [ws?.allergies || 'None reported', ws?.anaphylactic ? '· ANAPHYLACTIC: YES' : ''].filter(Boolean).join(' ')
    doc.font(F_REGULAR).fontSize(8.5).text(text, MARGIN + 5, doc.y, { width: CONTENT_W - 10 })
  })

  // Medications
  questionBlock(doc, 'ARE YOU TAKING ANY PRESCRIBED OR NON-PRESCRIBED MEDICATIONS, HERBAL REMEDIES, SUPPLEMENTS OR MULTI-VITAMINS?', () => {
    doc.font(F_BOLD).fontSize(7).fillColor(ACCENT)
      .text('IF TAKING ANY PRESCRIBED MEDICATION, A COPY OF YOUR PRESCRIPTION IS TO BE PROVIDED', MARGIN + 5, doc.y, { width: CONTENT_W - 10 })
    doc.fillColor('#000')

    if (medications.length === 0) {
      doc.font(F_REGULAR).fontSize(8.5).text('No medications reported', MARGIN + 5, doc.y, { width: CONTENT_W - 10 })
    } else {
      // Medication table header
      const tY = doc.y + 2
      const cols = [CONTENT_W * 0.30, CONTENT_W * 0.20, CONTENT_W * 0.25, CONTENT_W * 0.25]
      const headers = ['MEDICATION', 'DOSAGE', 'FREQUENCY', 'CATEGORY']
      let tx = MARGIN

      for (let i = 0; i < headers.length; i++) {
        doc.rect(tx, tY, cols[i], 14).fillAndStroke('#ebebeb', '#cccccc')
        doc.fillColor('#000').font(F_BOLD).fontSize(7)
          .text(headers[i], tx + 3, tY + 4, { width: cols[i] - 6, lineBreak: false })
        tx += cols[i]
      }
      doc.y = tY + 14

      for (const med of medications) {
        const rY = doc.y
        tx = MARGIN
        const rh = 14
        const flagged = med.reviewFlag && med.reviewFlag !== 'none' && med.reviewFlag !== 'None'
        const cells = [med.name || '—', med.dosage || '—', med.frequency || '—', med.reviewFlag || '—']

        for (let i = 0; i < cells.length; i++) {
          doc.rect(tx, rY, cols[i], rh).stroke('#cccccc')
          const color = (i === 3 && flagged) ? ACCENT : '#000'
          const weight = (i === 3 && flagged) ? F_BOLD : F_REGULAR
          doc.fillColor(color).font(weight).fontSize(8)
            .text(cells[i], tx + 3, rY + 3.5, { width: cols[i] - 6, lineBreak: false })
          tx += cols[i]
        }
        doc.fillColor('#000')
        doc.y = rY + rh
      }
    }

    if (scriptImages.length > 0) {
      doc.y += 3
      doc.font(F_ITALIC).fontSize(7).fillColor(MUTED)
        .text(`ℹ Prescription script images attached on page 3.`, MARGIN + 5, doc.y, { width: CONTENT_W - 10 })
      doc.fillColor('#000')
    }
  })

  pageFooter(doc, 1, totalPages)

  // ── PAGE 2 ──────────────────────────────────────────────────────────────────
  doc.addPage()
  pageHeader(doc, logoBuffer)

  sectionHeader(doc, 'MEDICAL HISTORY (CONTINUED)')

  // Tetanus
  questionBlock(doc, 'WHEN WAS YOUR LAST TETANUS INJECTION?', () => {
    const immunised = ws?.tetanus?.immunised
    const dose = ws?.tetanus?.lastDoseDate
    doc.font(F_REGULAR).fontSize(8.5)
      .text(
        `${immunised ? '☑' : '☐'} Immunised    Last dose date: ${dose ? fmtDate(dose) : '—'}`,
        MARGIN + 5, doc.y, { width: CONTENT_W - 10 }
      )
  })

  // Hepatitis B
  questionBlock(doc, 'ARE YOU IMMUNISED AGAINST HEPATITIS B?', () => {
    const immunised = ws?.hepatitisB?.immunised
    const dose = ws?.hepatitisB?.lastDoseDate
    doc.font(F_REGULAR).fontSize(8.5)
      .text(
        `${immunised ? '☑' : '☐'} Immunised    Last dose date: ${dose ? fmtDate(dose) : '—'}`,
        MARGIN + 5, doc.y, { width: CONTENT_W - 10 }
      )
  })

  // Conditions checklist
  questionBlock(doc, 'HAVE YOU EVER SUFFERED FROM ANY OF THE FOLLOWING?', () => {
    if (conditions.length === 0) {
      doc.font(F_REGULAR).fontSize(8).fillColor(MUTED).text('No conditions data', MARGIN + 5, doc.y)
      doc.fillColor('#000')
      return
    }
    const colW = CONTENT_W / 2
    const maxRows = Math.max(condCol1.length, condCol2.length)
    for (let i = 0; i < maxRows; i++) {
      const left  = condCol1[i]
      const right = condCol2[i]
      const rY = doc.y
      const rh = 13

      if (left) {
        const [lk, lv] = left
        const lYes = lv?.answer === true
        doc.font(F_REGULAR).fontSize(7.5).fillColor('#000')
          .text(lv?.label || lk, MARGIN + 5, rY + 3, { width: colW - 50, lineBreak: false })
        doc.text(lYes ? '☑' : '☐', MARGIN + colW - 44, rY + 3, { width: 12, lineBreak: false })
        doc.fillColor(lYes ? ACCENT : MUTED).font(lYes ? F_BOLD : F_REGULAR).fontSize(7.5)
          .text(lYes ? 'Yes' : 'No', MARGIN + colW - 30, rY + 3, { width: 25, lineBreak: false })
        doc.fillColor('#000')
      }
      if (right) {
        const [rk, rv] = right
        const rYes = rv?.answer === true
        doc.font(F_REGULAR).fontSize(7.5).fillColor('#000')
          .text(rv?.label || rk, MARGIN + colW + 5, rY + 3, { width: colW - 50, lineBreak: false })
        doc.text(rYes ? '☑' : '☐', MARGIN + CONTENT_W - 44, rY + 3, { width: 12, lineBreak: false })
        doc.fillColor(rYes ? ACCENT : MUTED).font(rYes ? F_BOLD : F_REGULAR).fontSize(7.5)
          .text(rYes ? 'Yes' : 'No', MARGIN + CONTENT_W - 30, rY + 3, { width: 25, lineBreak: false })
        doc.fillColor('#000')
      }
      // Divider
      doc.moveTo(MARGIN, rY + rh).lineTo(MARGIN + CONTENT_W, rY + rh).strokeColor('#e8e8e8').lineWidth(0.5).stroke()
      doc.strokeColor('#000').lineWidth(1)
      doc.y = rY + rh
    }
  })

  // Disclosed conditions details
  if (disclosed.length > 0) {
    questionBlock(doc, 'IF YOU ANSWERED YES TO ANY OF THE ABOVE, PLEASE PROVIDE DETAILS:', () => {
      for (const [key, val] of disclosed) {
        doc.font(F_BOLD).fontSize(8).fillColor('#000')
          .text(`${val?.label || key}:  `, MARGIN + 5, doc.y, { continued: true, width: CONTENT_W - 10 })
        doc.font(F_REGULAR).fontSize(8.5)
          .text(val?.detail || 'No further details provided')
      }
    })
  }

  // DECLARATION
  sectionHeader(doc, 'DECLARATION')
  doc.rect(MARGIN, doc.y, CONTENT_W, 28).stroke(BORDER)
  const declY = doc.y + 4
  doc.font(F_REGULAR).fontSize(8).fillColor('#000')
    .text(
      'In signing this document below, I declare that the above information is true and factual to the best of my knowledge.',
      MARGIN + 5, declY, { width: CONTENT_W - 10 }
    )
  doc.y = declY + 28
  twoColTable(doc, [
    ['FULL NAME',  ws?.fullName || '—',     'SIGNATURE', ''],
    ['DATE',       fmtDate(raw.visit_date || raw.submitted_at), 'EMPLOYEE ID', ws?.employeeId || '—'],
  ])

  // MEDIC REVIEW
  sectionHeader(doc, 'MEDIC REVIEW — MedPass Web')
  twoColTable(doc, [
    ['SITE',       siteName,                     'BUSINESS',  businessName],
    ['VISIT DATE', fmtDate(raw.visit_date),      'SHIFT',     raw.shift_type || '—'],
    ['STATUS',     raw.status || '—',            'EXPORTED',  fmtDateTime(raw.exported_at || new Date().toISOString())],
    ...(decision ? [
      ['DECISION', decision.outcome, 'DECIDED', fmtDateTime(decision.decided_at)] as [string, string, string, string],
    ] : []),
  ])
  if (decision?.note) {
    const noteY = doc.y
    doc.rect(MARGIN, noteY, CONTENT_W, 18).stroke(BORDER)
    doc.font(F_BOLD).fontSize(8).text('Note: ', MARGIN + 5, noteY + 5, { continued: true })
    doc.font(F_REGULAR).fontSize(8.5).text(decision.note)
    doc.y = noteY + 18
  }

  pageFooter(doc, 2, totalPages)

  // ── PAGE 3 — PRESCRIPTION SCRIPTS (optional) ─────────────────────────────
  if (scriptImages.length > 0) {
    doc.addPage()
    pageHeader(doc, logoBuffer)
    sectionHeader(doc, 'PRESCRIPTION SCRIPTS')

    doc.font(F_REGULAR).fontSize(8).fillColor(MUTED)
      .text('Copies of prescription scripts provided by the worker at time of declaration.', MARGIN, doc.y, { width: CONTENT_W })
    doc.y += 8
    doc.fillColor('#000')

    const imgW = (CONTENT_W - 16) / 2  // two per row with gap
    let col = 0
    let rowTop = doc.y

    for (const { name, buffer } of scriptImages) {
      const x = MARGIN + col * (imgW + 16)

      // Caption
      doc.font(F_BOLD).fontSize(8).fillColor('#000')
        .text(name, x, doc.y, { width: imgW, lineBreak: false })
      const imgY = doc.y + 12

      // Embed image
      try {
        doc.image(buffer, x, imgY, { fit: [imgW, 280] })
      } catch {
        doc.font(F_ITALIC).fontSize(8).fillColor(MUTED)
          .text('[Image could not be embedded]', x, imgY)
        doc.fillColor('#000')
      }

      if (col === 0) {
        col = 1
        doc.y = rowTop  // don't advance y yet — wait for right column
      } else {
        col = 0
        rowTop = imgY + 285  // advance past the tallest image in the row
        doc.y = rowTop
      }
    }

    // If odd number of images, advance y past the last one
    if (col === 1) {
      doc.y = rowTop + 285
    }

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
