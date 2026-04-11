import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import path from 'path'

// ─── Font paths ───────────────────────────────────────────────────────────────
export const FONTS_DIR  = path.join(process.cwd(), 'public', 'fonts')
export const F_REGULAR  = path.join(FONTS_DIR, 'inter-latin-400-normal.woff')
export const F_BOLD     = path.join(FONTS_DIR, 'inter-latin-700-normal.woff')
export const F_ITALIC   = path.join(FONTS_DIR, 'inter-latin-400-italic.woff')

// ─── Constants ───────────────────────────────────────────────────────────────
export const PAGE_W    = 595.28
export const PAGE_H    = 841.89
export const MARGIN    = 48
export const CONTENT_W = PAGE_W - MARGIN * 2

export const CHARCOAL = '#2D2D3E'
export const ACCENT   = '#CC3300'
export const LABEL_BG = '#f4f4f4'
export const BORDER   = '#bbbbbb'
export const MUTED    = '#555555'

// ─── Utilities ───────────────────────────────────────────────────────────────
export function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

export function sanitize(s: string): string {
  return s.replace(/[^\w\s\-_.]/g, '-').replace(/\s+/g, '-').slice(0, 80)
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return '—'
  try {
    const d = new Date(v)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '—' }
}

export function fmtDateTime(v: string | null | undefined): string {
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

export function parseJson<T>(raw: unknown): T | null {
  if (!raw) return null
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return (typeof v === 'object' && v !== null) ? v as T : null
  } catch { return null }
}

export function parseArray<T>(raw: unknown): T[] {
  if (!raw) return []
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(v) ? v as T[] : []
  } catch { return [] }
}

// ─── PDF Drawing Helpers ─────────────────────────────────────────────────────

export function pageHeader(
  doc: PDFKit.PDFDocument,
  logoBuffer?: Buffer | null,
  title = 'EMERGENCY MEDICAL INFORMATION FORM',
  options?: { businessName?: string | null }
) {
  const y = doc.y
  const headerH = 38
  doc.save()
  doc.rect(MARGIN, y, CONTENT_W, headerH).fill('#1A2332')

  doc.font(F_BOLD).fontSize(9).fillColor('#FFFFFF')
    .text(title, MARGIN + 10, y + 13, { width: CONTENT_W - 180, lineBreak: false })

  if (logoBuffer) {
    try {
      const logoBoxW = 156
      const logoBoxH = 24
      const logoBoxX = MARGIN + CONTENT_W - logoBoxW - 10
      const logoBoxY = y + 7

      doc
        .roundedRect(logoBoxX, logoBoxY, logoBoxW, logoBoxH, 5)
        .fill('#FFFFFF')

      doc.image(logoBuffer, logoBoxX + 8, logoBoxY + 3, {
        fit: [logoBoxW - 16, logoBoxH - 6],
        align: 'right',
        valign: 'center',
      })
    } catch {
      doc.font(F_BOLD).fontSize(8).fillColor('#FFFFFF')
        .text(options?.businessName || 'MedGuard', MARGIN + CONTENT_W - 150, y + 13, {
          width: 110,
          align: 'right',
          lineBreak: false,
        })
    }
  } else {
    doc.font(F_BOLD).fontSize(8).fillColor('#FFFFFF')
      .text(options?.businessName || 'MedGuard', MARGIN + CONTENT_W - 150, y + 13, {
        width: 110,
        align: 'right',
        lineBreak: false,
      })
  }

  doc.restore()
  doc.fillColor('#000')
  doc.y = y + headerH + 8
}

export function pageFooter(doc: PDFKit.PDFDocument, page: number, total: number) {
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

export function sectionHeader(doc: PDFKit.PDFDocument, title: string) {
  const y = doc.y
  doc.rect(MARGIN, y, CONTENT_W, 15).fill(CHARCOAL)
  doc.fillColor('#ffffff').font(F_BOLD).fontSize(7.5)
    .text(title, MARGIN + 6, y + 4, { width: CONTENT_W - 12, lineBreak: false })
  doc.fillColor('#000')
  doc.y = y + 15
}

/** Two-column key/value table. Each row = [label, value, optLabel?, optValue?] */
export function twoColTable(doc: PDFKit.PDFDocument, rows: [string, string, string?, string?][]) {
  const c1 = CONTENT_W * 0.19
  const c2 = CONTENT_W * 0.31
  const x1 = MARGIN, x2 = x1 + c1, x3 = x2 + c2, x4 = x3 + c1
  const labelOptions = { width: c1 - 6, align: 'left' as const }
  const valueOptions = { width: c2 - 8, align: 'left' as const }

  for (const [l1, v1, l2, v2] of rows) {
    const y = doc.y
    const leftLabel = l1 || '—'
    const leftValue = v1 || '—'
    const rightLabel = l2 || ''
    const rightValue = v2 || '—'

    doc.font(F_BOLD).fontSize(7)
    const leftLabelHeight = doc.heightOfString(leftLabel, labelOptions)
    const rightLabelHeight = l2 !== undefined ? doc.heightOfString(rightLabel, labelOptions) : 0

    doc.font(F_REGULAR).fontSize(8.5)
    const leftValueHeight = doc.heightOfString(leftValue, valueOptions)
    const rightValueHeight = l2 !== undefined ? doc.heightOfString(rightValue, valueOptions) : 0

    const rh = Math.max(
      17,
      leftLabelHeight + 10,
      leftValueHeight + 9,
      l2 !== undefined ? rightLabelHeight + 10 : 0,
      l2 !== undefined ? rightValueHeight + 9 : 0,
    )

    doc.rect(x1, y, c1, rh).fillAndStroke(LABEL_BG, BORDER)
    doc.fillColor('#444').font(F_BOLD).fontSize(7)
      .text(leftLabel, x1 + 3, y + 5, labelOptions)

    doc.rect(x2, y, c2, rh).stroke(BORDER)
    doc.fillColor('#000').font(F_REGULAR).fontSize(8.5)
      .text(leftValue, x2 + 4, y + 4.5, valueOptions)

    if (l2 !== undefined) {
      doc.rect(x3, y, c1, rh).fillAndStroke(LABEL_BG, BORDER)
      doc.fillColor('#444').font(F_BOLD).fontSize(7)
        .text(rightLabel, x3 + 3, y + 5, labelOptions)
      doc.rect(x4, y, c2, rh).stroke(BORDER)
      doc.fillColor('#000').font(F_REGULAR).fontSize(8.5)
        .text(rightValue, x4 + 4, y + 4.5, valueOptions)
    } else {
      doc.rect(x3, y, c1 + c2, rh).stroke(BORDER)
    }

    doc.fillColor('#000')
    doc.y = y + rh
  }
  doc.y += 5
}

export function questionBlock(doc: PDFKit.PDFDocument, question: string, content: () => void) {
  const startY = doc.y
  doc.font(F_BOLD).fontSize(7).fillColor('#333')
    .text(question, MARGIN + 5, startY + 4, { width: CONTENT_W - 10 })
  doc.y += 2
  doc.fillColor('#000')
  content()
  const endY = doc.y + 4
  doc.rect(MARGIN, startY, CONTENT_W, endY - startY).stroke(BORDER)
  doc.y = endY
}

export function renderAuditEntries(
  doc: PDFKit.PDFDocument,
  title: string,
  entries: Array<{
    authorName?: string | null
    createdAt?: string | null
    note?: string | null
    actionLabel?: string | null
  }>,
) {
  const visibleEntries = entries.filter((entry) => entry.note?.trim())
  if (visibleEntries.length === 0) return

  sectionHeader(doc, title)

  for (const entry of visibleEntries) {
    const authorText = entry.authorName?.trim() || 'Medic'
    const stampText = fmtDateTime(entry.createdAt)
    const metaText = entry.actionLabel?.trim()
      ? `${authorText} · ${stampText} · ${entry.actionLabel.trim()}`
      : `${authorText} · ${stampText}`

    const note = entry.note?.trim() || '—'
    const boxHeight = Math.max(
      38,
      doc.heightOfString(note, {
        width: CONTENT_W - 12,
        align: 'left',
      }) + 24,
    )
    const top = doc.y

    doc.rect(MARGIN, top, CONTENT_W, boxHeight).stroke(BORDER)
    doc.font(F_BOLD).fontSize(7.5).fillColor('#444')
      .text(metaText, MARGIN + 6, top + 6, { width: CONTENT_W - 12 })
    doc.font(F_REGULAR).fontSize(8.5).fillColor('#000')
      .text(note, MARGIN + 6, top + 18, { width: CONTENT_W - 12 })
    doc.y = top + boxHeight + 5
  }
}

export function renderExportAuditSummary(
  doc: PDFKit.PDFDocument,
  details: {
    exportedByName?: string | null
    exportedAt?: string | null
    exportKind?: 'first_export' | 're_export'
    firstExportedAt?: string | null
  },
) {
  sectionHeader(doc, 'EXPORT AUDIT')
  twoColTable(doc, [
    ['EXPORTED BY', details.exportedByName?.trim() || '—', 'EXPORTED AT', fmtDateTime(details.exportedAt)],
    ['AUDIT STATE', details.exportKind === 're_export' ? 'Re-export' : 'First export', 'FIRST EXPORTED', fmtDateTime(details.firstExportedAt ?? details.exportedAt)],
  ])
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

export async function getAuthenticatedMedic() {
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
    .from('user_accounts').select('role, display_name, business_id, site_ids, is_inactive, contract_end_date').eq('id', user.id).single()
  const contractExpired = account?.contract_end_date
    ? new Date(account.contract_end_date).getTime() < Date.now()
    : false
  if (!account || account.role !== 'medic' || account.is_inactive || contractExpired) return null
  return { user, account, authClient }
}

export async function getAuthenticatedSuperuser() {
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
    .from('user_accounts').select('role, display_name, business_id').eq('id', user.id).single()
  if (!account || account.role !== 'superuser') return null
  return { user, account, authClient }
}
