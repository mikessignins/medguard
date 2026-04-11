import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { sanitize, streamToBuffer, F_REGULAR, F_BOLD, MARGIN, CONTENT_W, getAuthenticatedSuperuser } from '@/lib/pdf-helpers'
import { logAndReturnInternalError, NO_STORE_HEADERS } from '@/lib/api-security'

export const runtime = 'nodejs'

interface DeidentifiedConditionMetric {
  metric_group: string
  display_order: number
  metric_key: string
  metric_label: string
  affected_workers: number | null
  cohort_workers: number | null
  prevalence_percent: number | null
  is_suppressed: boolean
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedSuperuser()
    if (!auth) return new NextResponse('Unauthorized', { status: 401 })

    const url = new URL(request.url)
    const businessId = (url.searchParams.get('business_id') || '').trim()
    const siteId = (url.searchParams.get('site_id') || 'all').trim()
    const from = (url.searchParams.get('from') || '').trim()
    const to = (url.searchParams.get('to') || '').trim()

    if (!businessId) return new NextResponse('Missing business_id', { status: 400 })

    const { data: business } = await auth.authClient
      .from('businesses')
      .select('id, name')
      .eq('id', businessId)
      .single()

    const { data: site } = siteId !== 'all'
      ? await auth.authClient.from('sites').select('id, name').eq('id', siteId).single()
      : { data: null as { id: string; name: string } | null }

    const { data: metrics, error } = await auth.authClient.rpc(
      'get_business_deidentified_health_report_filtered',
      {
        p_business_id: businessId,
        p_site_id: siteId === 'all' ? null : siteId,
        p_from: from ? `${from}T00:00:00Z` : null,
        p_to: to ? `${to}T23:59:59Z` : null,
      },
    )
    if (error) return logAndReturnInternalError('/api/superuser/reports/deidentified-pdf', error)

    const rows = (metrics || []) as DeidentifiedConditionMetric[]
    const allSuppressed = rows.length > 0 && rows.every((row) => row.is_suppressed)
    const groupedRows = rows.reduce<Record<string, DeidentifiedConditionMetric[]>>((acc, row) => {
      acc[row.metric_group] ??= []
      acc[row.metric_group].push(row)
      return acc
    }, {})
    const cohortWorkers = rows.find((row) => !row.is_suppressed && row.cohort_workers != null)?.cohort_workers ?? null

    const doc = new PDFDocument({ size: 'A4', margin: MARGIN })
    const bufferPromise = streamToBuffer(doc)

    doc.font(F_BOLD).fontSize(18).text('De-identified Workforce Health Report', MARGIN, 48, { width: CONTENT_W })
    doc.moveDown(0.3)

    doc.font(F_REGULAR).fontSize(10)
      .text(`Business: ${business?.name || businessId}`)
      .text(`Site: ${siteId === 'all' ? 'All sites' : (site?.name || siteId)}`)
      .text(`Date Range: ${from || 'All time'} to ${to || 'All time'}`)
      .text(`Cohort: ${allSuppressed ? 'Suppressed' : (cohortWorkers ?? 0)}`)
      .text(`Generated: ${new Date().toISOString()}`)
      .moveDown(0.6)

    doc.font(F_REGULAR).fontSize(8.5)
      .text(
        'This report is de-identified. It contains aggregate counts and percentages only. ' +
        'No worker-level personal or clinical identifiers are included.',
        { width: CONTENT_W }
      )
      .moveDown(0.8)

    if (rows.length === 0) {
      doc.font(F_REGULAR).fontSize(10).text('No metrics available for this filter.')
    } else {
      if (allSuppressed) {
        doc.font(F_BOLD).fontSize(9).fillColor('#A16207')
          .text('All metrics are suppressed due to small cohort size.')
        doc.fillColor('#000').moveDown(0.5)
      }

      const col1 = CONTENT_W * 0.50
      const col2 = CONTENT_W * 0.16
      const col3 = CONTENT_W * 0.16
      const col4 = CONTENT_W * 0.18
      const x1 = MARGIN
      const x2 = x1 + col1
      const x3 = x2 + col2
      const x4 = x3 + col3

      const drawHeader = () => {
        const y = doc.y
        doc.rect(x1, y, col1, 18).fillAndStroke('#F1F5F9', '#CBD5E1')
        doc.rect(x2, y, col2, 18).fillAndStroke('#F1F5F9', '#CBD5E1')
        doc.rect(x3, y, col3, 18).fillAndStroke('#F1F5F9', '#CBD5E1')
        doc.rect(x4, y, col4, 18).fillAndStroke('#F1F5F9', '#CBD5E1')
        doc.fillColor('#000').font(F_BOLD).fontSize(8)
          .text('Metric', x1 + 4, y + 5, { width: col1 - 8 })
          .text('Affected', x2 + 4, y + 5, { width: col2 - 8, align: 'center' })
          .text('Cohort', x3 + 4, y + 5, { width: col3 - 8, align: 'center' })
          .text('Prevalence', x4 + 4, y + 5, { width: col4 - 8, align: 'center' })
        doc.y = y + 18
      }

      for (const [groupName, groupMetrics] of Object.entries(groupedRows)) {
        if (doc.y > 720) doc.addPage()
        doc.moveDown(0.3)
        doc.font(F_BOLD).fontSize(11).fillColor('#0F172A').text(groupName, x1, doc.y, { width: CONTENT_W })
        doc.moveDown(0.2)
        doc.font(F_REGULAR).fontSize(8).fillColor('#475569').text(
          groupName === 'Emergency Planning'
            ? 'Signals that support emergency response readiness, communication planning, and medication follow-up.'
            : 'De-identified prevalence of key condition signals across the selected workforce cohort.',
          x1,
          doc.y,
          { width: CONTENT_W }
        )
        doc.moveDown(0.4)

        drawHeader()
        doc.font(F_REGULAR).fontSize(8.5).fillColor('#000')

        for (const row of groupMetrics) {
          if (doc.y > 760) {
            doc.addPage()
            doc.font(F_BOLD).fontSize(11).fillColor('#0F172A').text(groupName, x1, doc.y, { width: CONTENT_W })
            doc.moveDown(0.4)
            drawHeader()
            doc.font(F_REGULAR).fontSize(8.5).fillColor('#000')
          }
          const y = doc.y
          const affected = row.is_suppressed ? 'Suppressed' : String(row.affected_workers ?? 0)
          const cohort = row.is_suppressed ? 'Suppressed' : String(row.cohort_workers ?? 0)
          const prevalence = row.is_suppressed ? 'Suppressed' : `${row.prevalence_percent ?? 0}%`

          doc.rect(x1, y, col1, 18).stroke('#E2E8F0')
          doc.rect(x2, y, col2, 18).stroke('#E2E8F0')
          doc.rect(x3, y, col3, 18).stroke('#E2E8F0')
          doc.rect(x4, y, col4, 18).stroke('#E2E8F0')

          doc.fillColor('#000')
            .text(row.metric_label, x1 + 4, y + 5, { width: col1 - 8 })
            .text(affected, x2 + 4, y + 5, { width: col2 - 8, align: 'center' })
            .text(cohort, x3 + 4, y + 5, { width: col3 - 8, align: 'center' })
            .text(prevalence, x4 + 4, y + 5, { width: col4 - 8, align: 'center' })

          doc.y = y + 18
        }

        doc.moveDown(0.6)
      }

      doc.font(F_REGULAR).fontSize(7.5).fillColor('#475569')
        .text(`Report rows: ${rows.length}`, x1, doc.y, { width: CONTENT_W })
      doc.fillColor('#000')
    }

    doc.end()
    const buffer = await bufferPromise
    const filename = sanitize(`deidentified-report-${businessId}-${new Date().toISOString().slice(0, 10)}`) + '.pdf'

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return logAndReturnInternalError('/api/superuser/reports/deidentified-pdf', err)
  }
}
