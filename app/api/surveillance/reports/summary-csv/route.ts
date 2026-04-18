import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS, logAndReturnInternalError } from '@/lib/api-security'
import { getSurveillanceReportsSummary } from '@/lib/surveillance/queries'

export const runtime = 'nodejs'

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function csvRow(values: Array<string | number | null | undefined>) {
  return values.map(csvCell).join(',')
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export async function GET() {
  try {
    const data = await getSurveillanceReportsSummary()
    if (!data) {
      return NextResponse.json(
        { error: 'Surveillance reporting is unavailable for this account.' },
        { status: 403, headers: NO_STORE_HEADERS },
      )
    }

    const businessName = data.context.business?.name ?? data.context.account.business_id
    const generatedAt = new Date().toISOString()
    const rows = [
      csvRow(['Report', 'Occupational Health Surveillance Summary']),
      csvRow(['Business', businessName]),
      csvRow(['Generated at', generatedAt]),
      csvRow(['Privacy boundary', 'Aggregate operational metadata only. No clinical measurements, diagnoses, reports, attachments, provider notes, or worker-level details are included.']),
      '',
      csvRow(['Section', 'Metric', 'Value', 'Notes']),
      csvRow(['Workforce', 'Workers requiring surveillance', data.workerCount, 'Active workers flagged for health surveillance']),
      csvRow(['Workforce', 'App workers', data.appWorkerCount, 'Workers linked to an app account']),
      csvRow(['Workforce', 'Manual-entry workers', data.manualWorkerCount, 'Workers entered by occupational health staff']),
      csvRow(['Compliance', 'Green', data.complianceSummary.green, 'All assigned surveillance requirements current']),
      csvRow(['Compliance', 'Amber', data.complianceSummary.amber, 'One or more requirements due soon']),
      csvRow(['Compliance', 'Red', data.complianceSummary.red, 'One or more requirements overdue']),
      csvRow(['Compliance', 'Grey', data.complianceSummary.grey, 'Baseline or intake incomplete']),
      csvRow(['Compliance', 'Fully current percent', data.complianceSummary.fullyCurrentPercent, 'Derived from active surveillance assignments']),
      csvRow(['Operations', 'Active enrolments', data.metrics.active_enrolment_count, 'Active surveillance enrolments']),
      csvRow(['Operations', 'Due soon', data.metrics.due_soon_count, 'Requirements due inside the planning window']),
      csvRow(['Operations', 'Overdue', data.metrics.overdue_count, 'Requirements past due']),
      csvRow(['Operations', 'Upcoming appointments', data.metrics.upcoming_count, 'Scheduled future appointments']),
      csvRow(['Operations', 'Completed this week', data.metrics.completed_week_count, 'Completed appointment outcomes in the current week']),
      csvRow(['Operations', 'Open review tasks', data.openReviewTaskCount, 'New starter, transfer, role change, or self-declaration reviews']),
      csvRow(['Operations', 'Availability conflicts', data.workersWithAvailabilityConflicts, 'Current or near-term availability exceptions']),
      '',
      csvRow(['Site compliance']),
      csvRow(['Site', 'Workers', 'Green', 'Amber', 'Red', 'Grey']),
      ...data.siteBreakdown.map((row) => csvRow([
        row.siteName,
        row.workerCount,
        row.green,
        row.amber,
        row.red,
        row.grey,
      ])),
      '',
      csvRow(['Requirement workload']),
      csvRow(['Requirement', 'Active enrolments', 'Baseline incomplete', 'Due soon', 'Overdue', 'No due date']),
      ...data.requirementBreakdown.map((row) => csvRow([
        row.requirementName,
        row.activeEnrolments,
        row.baselineIncomplete,
        row.dueSoon,
        row.overdue,
        row.noDueDate,
      ])),
      '',
      csvRow(['Provider workload']),
      csvRow(['Provider', 'Location', 'Scheduled', 'Completed', 'Did not attend', 'Cancelled']),
      ...data.providerBreakdown.map((row) => csvRow([
        row.providerName,
        row.providerLocationName,
        row.scheduled,
        row.completed,
        row.didNotAttend,
        row.cancelled,
      ])),
    ]

    return new NextResponse(`${rows.join('\n')}\n`, {
      headers: {
        ...NO_STORE_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="occupational-health-summary-${timestampForFilename()}.csv"`,
      },
    })
  } catch (error) {
    return logAndReturnInternalError('/api/surveillance/reports/summary-csv', error)
  }
}
