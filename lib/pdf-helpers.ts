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
) {
  const y = doc.y
  doc.font(F_BOLD).fontSize(8).fillColor('#000')
    .text(title, MARGIN, y, { width: CONTENT_W - 60, lineBreak: false })

  if (logoBuffer) {
    try {
      doc.image(logoBuffer, MARGIN + CONTENT_W - 50, y - 1, { height: 14, fit: [50, 14] })
    } catch {
      doc.font(F_BOLD).fontSize(8).fillColor('#0891B2')
        .text('MedPass', MARGIN + CONTENT_W - 50, y, { width: 50, align: 'right', lineBreak: false })
    }
  } else {
    doc.font(F_BOLD).fontSize(8).fillColor('#0891B2')
      .text('MedPass', MARGIN + CONTENT_W - 50, y, { width: 50, align: 'right', lineBreak: false })
  }

  doc.fillColor('#000')
  const lineY = y + 14
  doc.moveTo(MARGIN, lineY).lineTo(MARGIN + CONTENT_W, lineY).lineWidth(1.5).strokeColor('#000').stroke()
  doc.strokeColor('#000').lineWidth(1)
  doc.y = lineY + 6
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

  for (const [l1, v1, l2, v2] of rows) {
    const y = doc.y
    const rh = 17

    doc.rect(x1, y, c1, rh).fillAndStroke(LABEL_BG, BORDER)
    doc.fillColor('#444').font(F_BOLD).fontSize(7)
      .text(l1, x1 + 3, y + 5, { width: c1 - 6, lineBreak: false })

    doc.rect(x2, y, c2, rh).stroke(BORDER)
    doc.fillColor('#000').font(F_REGULAR).fontSize(8.5)
      .text(v1 || '—', x2 + 4, y + 4.5, { width: c2 - 8, lineBreak: false })

    if (l2 !== undefined) {
      doc.rect(x3, y, c1, rh).fillAndStroke(LABEL_BG, BORDER)
      doc.fillColor('#444').font(F_BOLD).fontSize(7)
        .text(l2, x3 + 3, y + 5, { width: c1 - 6, lineBreak: false })
      doc.rect(x4, y, c2, rh).stroke(BORDER)
      doc.fillColor('#000').font(F_REGULAR).fontSize(8.5)
        .text(v2 || '—', x4 + 4, y + 4.5, { width: c2 - 8, lineBreak: false })
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
    .from('user_accounts').select('role, display_name, business_id').eq('id', user.id).single()
  if (!account || account.role !== 'medic') return null
  return { user, account }
}
