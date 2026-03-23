import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import path from 'path'
import PDFDocument from 'pdfkit'
import type { WorkerSnapshot, Decision, ScriptUpload } from '@/lib/types'

// PDFKit requires Node.js runtime — not compatible with Vercel Edge
export const runtime = 'nodejs'

// ─── Font paths ───────────────────────────────────────────────────────────────
// Use woff2 font files from public/fonts/ instead of pdfkit's built-in AFM
// fonts. This avoids the ENOENT error that occurs when pdfkit is bundled by
// webpack and __dirname resolves to the route directory rather than the
// pdfkit package directory.
const FONTS_DIR  = path.join(process.cwd(), 'public', 'fonts')
const F_REGULAR  = path.join(FONTS_DIR, 'inter-latin-400-normal.woff')
const F_BOLD     = path.join(FONTS_DIR, 'inter-latin-700-normal.woff')
const F_ITALIC   = path.join(FONTS_DIR, 'inter-latin-400-italic.woff')

// ─── Constants ───────────────────────────────────────────────────────────────
const PAGE_W = 595.28   // A4 width in points
const PAGE_H = 841.89   // A4 height in points
const MARGIN = 48
const CONTENT_W = PAGE_W - MARGIN * 2

const CHARCOAL = '#2D2D3E'
const ACCENT   = '#CC3300'
const LABEL_BG = '#f4f4f4'
const BORDER   = '#bbbbbb'
const MUTED    = '#555555'

// ─── Utilities ───────────────────────────────────────────────────────────────
function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

function sanitize(s: string): string {
  return s.replace(/[^\w\s\-_.]/g, '-').replace(/\s+/g, '-').slice(0, 80)
}

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return '—'
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return '—'
    return (
      d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    )
  } catch { return '—' }
}

function parseJson<T>(raw: unknown): T | null {
  if (!raw) return null
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return (typeof v === 'object' && v !== null) ? v as T : null
  } catch { return null }
}

function parseArray<T>(raw: unknown): T[] {
  if (!raw) return []
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(v) ? v as T[] : []
  } catch { return [] }
}

// ─── PDF Drawing Helpers ─────────────────────────────────────────────────────

function pageHeader(doc: PDFKit.PDFDocument) {
  const y = doc.y
  doc.font(F_BOLD).fontSize(8).fillColor('#000')
    .text('EMERGENCY MEDICAL INFORMATION FORM', MARGIN, y, { width: CONTENT_W - 60, lineBreak: false })
  doc.font(F_BOLD).fontSize(8).fillColor('#0891B2')
    .text('MedM8', MARGIN + CONTENT_W - 50, y, { width: 50, align: 'right', lineBreak: false })
  doc.fillColor('#000')
  const lineY = y + 14
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY).lineWidth(1.5).strokeColor('#000').stroke()
  doc.strokeColor('#000').lineWidth(1)
  doc.y = lineY + 6
}

function pageFooter(doc: PDFKit.PDFDocument, page: number, total: number) {
  const fy = PAGE_H - MARGIN - 22
  doc.moveTo(MARGIN, fy).lineTo(MARGIN + CONTENT_W, fy).strokeColor('#cccccc').lineWidth(0.5).stroke()
  doc.lineWidth(1).strokeColor('#000')
  doc.font(F_REGULAR).fontSize(7).fillColor(MUTED)
    .text('ISSUE DATE: 14/11/2023', MARGIN, fy + 4, { lineBreak: false })
  doc.text('MRL-SAF-FRM-0097_01', MARGIN + CONTENT_W / 2 - 40, fy + 4, { lineBreak: false })
  doc.text(`PAGE ${page} OF ${total}`, MARGIN + CONTENT_W - 55, fy + 4, { width: 55, align: 'right', lineBreak: false })
  doc.font(F_REGULAR).fontSize(6.5).fillColor(ACCENT)
    .text(
      'Printed copies of this document are not controlled. Please ensure that this is the latest available version before use.',
      MARGIN, fy + 13, { width: CONTENT_W, align: 'center', lineBreak: false }
    )
  doc.fillColor('#000')
}

function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  const y = doc.y
  doc.rect(MARGIN, y, CONTENT_W, 15).fill(CHARCOAL)
  doc.fillColor('#ffffff').font(F_BOLD).fontSize(7.5)
    .text(title, MARGIN + 6, y + 4, { width: CONTENT_W - 12, lineBreak: false })
  doc.fillColor('#000')
  doc.y = y + 15
}

/** Two-column key/value table. Each row = [label, value, optLabel?, optValue?] */
function twoColTable(doc: PDFKit.PDFDocument, rows: [string, string, string?, string?][]) {
  const c1 = CONTENT_W * 0.19  // label
  const c2 = CONTENT_W * 0.31  // value
  const x1 = MARGIN, x2 = x1 + c1, x3 = x2 + c2, x4 = x3 + c1

  for (const [l1, v1, l2, v2] of rows) {
    const y = doc.y
    const rh = 17

    // Left label
    doc.rect(x1, y, c1, rh).fillAndStroke(LABEL_BG, BORDER)
    doc.fillColor('#444').font(F_BOLD).fontSize(7)
      .text(l1, x1 + 3, y + 5, { width: c1 - 6, lineBreak: false })

    // Left value
    doc.rect(x2, y, c2, rh).stroke(BORDER)
    doc.fillColor('#000').font(F_REGULAR).fontSize(8.5)
      .text(v1 || '—', x2 + 4, y + 4.5, { width: c2 - 8, lineBreak: false })

    if (l2 !== undefined) {
      // Right label
      doc.rect(x3, y, c1, rh).fillAndStroke(LABEL_BG, BORDER)
      doc.fillColor('#444').font(F_BOLD).fontSize(7)
        .text(l2, x3 + 3, y + 5, { width: c1 - 6, lineBreak: false })
      // Right value
      doc.rect(x4, y, c2, rh).stroke(BORDER)
      doc.fillColor('#000').font(F_REGULAR).fontSize(8.5)
        .text(v2 || '—', x4 + 4, y + 4.5, { width: c2 - 8, lineBreak: false })
    } else {
      // Span right columns
      doc.rect(x3, y, c1 + c2, rh).stroke(BORDER)
    }

    doc.fillColor('#000')
    doc.y = y + rh
  }
  doc.y += 5
}

function questionBlock(doc: PDFKit.PDFDocument, question: string, content: () => void) {
  const startY = doc.y
  // Question label
  doc.font(F_BOLD).fontSize(7).fillColor('#333')
    .text(question, MARGIN + 5, startY + 4, { width: CONTENT_W - 10 })
  doc.y += 2
  doc.fillColor('#000')
  content()
  const endY = doc.y + 4
  doc.rect(MARGIN, startY, CONTENT_W, endY - startY).stroke(BORDER)
  doc.y = endY
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getAuthenticatedMedic() {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null
  const { data: account } = await authClient
    .from('user_accounts').select('role').eq('id', user.id).single()
  if (!account || account.role !== 'medic') return null
  return user
}

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
  const user = await getAuthenticatedMedic()
  if (!user) {
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
    supabase.from('businesses').select('name').eq('id', raw.business_id).single(),
  ])

  const siteName     = site?.name     || raw.site_id     || ''
  const businessName = business?.name || raw.business_id || ''

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
  pageHeader(doc)

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
  pageHeader(doc)

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
  sectionHeader(doc, 'MEDIC REVIEW — MedM8 Web')
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
    pageHeader(doc)
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
