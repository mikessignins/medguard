import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { resolveBusinessLogoUrl } from '@/lib/business-logo'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseUuidParam } from '@/lib/api-validation'
import { markExportedIfNeeded } from '@/lib/export-stamp'
import type { FatigueAssessment, FatigueMedicReviewPayload, FatigueModulePayload } from '@/lib/types'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { safeLogServerEvent } from '@/lib/app-event-log'
import {
  streamToBuffer,
  sanitize,
  fmtDateTime,
  pageHeader,
  pageFooter,
  sectionHeader,
  twoColTable,
  renderAuditEntries,
  renderExportAuditSummary,
  F_REGULAR,
  F_BOLD,
  MARGIN,
  CONTENT_W,
  getAuthenticatedMedic,
} from '@/lib/pdf-helpers'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const parsedId = parseUuidParam(params.id, 'Fatigue assessment id')
  if (!parsedId.success) return parsedId.response

  try {
    return await generateFatiguePdf(parsedId.value)
  } catch (err) {
    console.error('[fatigue/pdf] unhandled error:', err)
    return new NextResponse(
      `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      { status: 500 },
    )
  }
}

function formatDecision(decision: FatigueMedicReviewPayload['fitForWorkDecision']) {
  switch (decision) {
    case 'fit_normal_duties':
      return 'Fit for normal duties'
    case 'fit_restricted_duties':
      return 'Fit for restricted duties'
    case 'not_fit_for_work':
      return 'Not fit for work'
    case 'sent_to_room':
      return 'Sent to room'
    case 'sent_home':
      return 'Sent home'
    case 'requires_escalation':
      return 'Requires escalation'
    default:
      return '—'
  }
}

function formatAssessmentContext(value: FatigueAssessment['payload']['workerAssessment']['assessmentContext']) {
  switch (value) {
    case 'pre_shift':
      return 'Pre-shift'
    case 'during_shift':
      return 'During shift'
    case 'post_shift':
      return 'Post-shift'
    case 'journey_management':
      return 'Journey management'
    case 'peer_or_supervisor_concern':
      return 'Peer or supervisor concern'
    case 'other':
      return 'Other'
  }
}

function formatAlertness(value: FatigueAssessment['payload']['workerAssessment']['alertnessRating']) {
  switch (value) {
    case 'a_active_alert_wide_awake':
      return 'A. Active, alert, wide awake'
    case 'b_functioning_well_not_peak':
      return 'B. Functioning well, but not at peak'
    case 'c_ok_but_not_fully_alert':
      return 'C. OK, but not fully alert'
    case 'd_groggy_hard_to_concentrate':
      return 'D. Groggy, hard to concentrate'
    case 'e_sleepy_would_like_to_lie_down':
      return 'E. Sleepy, would like to lie down'
  }
}

function formatAlcoholBand(value: FatigueAssessment['payload']['workerAssessment']['alcoholBeforeSleepBand']) {
  switch (value) {
    case 'none':
      return 'None'
    case 'one_to_two':
      return '1 to 2 standard drinks'
    case 'three_to_four':
      return '3 to 4 standard drinks'
    case 'five_or_more':
      return '5 or more standard drinks'
  }
}

function formatBool(value: boolean | null | undefined) {
  return value ? 'Yes' : 'No'
}

async function generateFatiguePdf(id: string) {
  const auth = await getAuthenticatedMedic()
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })
  const { user, account, authClient } = auth

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'fatigue_pdf_exported',
    actorUserId: user.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: account.business_id,
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/[id]/pdf',
    targetId: id,
    limit: 10,
    windowMs: 5 * 60_000,
    errorMessage: 'Too many fatigue PDF exports were requested. Please wait a few minutes and try again.',
  })
  if (rateLimited) return rateLimited

  const supabase = authClient

  const { data: raw, error } = await supabase
    .from('module_submissions')
    .select('*')
    .eq('id', id)
    .eq('module_key', 'fatigue_assessment')
    .single()

  if (error || !raw) {
    return new NextResponse('Fatigue assessment not found', { status: 404 })
  }

  if (!hasMedicScopeAccess(account, raw)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  if (raw.is_test) {
    return new NextResponse(
      'This is a test fatigue assessment and cannot be exported.',
      { status: 422 },
    )
  }

  if (raw.phi_purged_at) {
    return new NextResponse(
      'This fatigue assessment has already been purged and can no longer be exported.',
      { status: 422 },
    )
  }

  if (raw.status !== 'resolved') {
    return new NextResponse(
      `Only medic-reviewed fatigue assessments can be exported. Current status: ${raw.status ?? 'Unknown'}.`,
      { status: 422 },
    )
  }

  const payload = raw.payload as FatigueModulePayload
  const reviewPayload = (raw.review_payload as FatigueMedicReviewPayload | null) ?? {}

  if (!reviewPayload.fitForWorkDecision) {
    return new NextResponse(
      'A completed medic outcome is required before a fatigue assessment can be exported.',
      { status: 422 },
    )
  }

  const [{ data: site }, { data: business }] = await Promise.all([
    supabase.from('sites').select('name').eq('id', raw.site_id).single(),
    supabase
      .from('businesses')
      .select('name, logo_url, logo_url_light, logo_url_dark')
      .eq('id', raw.business_id)
      .single(),
  ])

  const siteName = site?.name || raw.site_id || ''
  const businessName = business?.name || raw.business_id || ''

  let logoBuffer: Buffer | null = null
  const businessLogoUrl = resolveBusinessLogoUrl(business, 'light')
  if (businessLogoUrl) {
    try {
      const logoRes = await fetch(businessLogoUrl)
      if (logoRes.ok) logoBuffer = Buffer.from(await logoRes.arrayBuffer())
    } catch (error) {
      console.warn('[fatigue/pdf] failed to fetch business logo', {
        assessmentId: id,
        businessId: raw.business_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const worker = payload.workerAssessment
  const summary = payload.workerScoreSummary

  const fullName = worker.workerNameSnapshot?.trim() || 'Unknown'
  const dateStr = raw.submitted_at ? String(raw.submitted_at).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const filename = sanitize(`${fullName} - Fatigue - ${dateStr} - ${siteName} - ${businessName}`) + '.pdf'

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, autoFirstPage: false })
  const bufferPromise = streamToBuffer(doc)
  const exportRenderedAt = new Date().toISOString()
  const exportKind = raw.exported_at ? 're_export' : 'first_export'
  const firstExportedAt = raw.exported_at ?? exportRenderedAt

  doc.addPage()
  pageHeader(doc, logoBuffer, 'FATIGUE ASSESSMENT')

  doc.font(F_BOLD).fontSize(16).fillColor('#000')
    .text('FATIGUE ASSESSMENT', MARGIN, doc.y, { width: CONTENT_W })
  doc.y += 4
  doc.font(F_REGULAR).fontSize(8).fillColor('#000')
    .text(
      'This record captures a worker fatigue self-assessment and the medic or ESO review outcome for operational handover and clinical governance.',
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    )
  doc.y += 8

  sectionHeader(doc, 'WORKER AND SHIFT CONTEXT')
  twoColTable(doc, [
    ['WORKER', worker.workerNameSnapshot || '—', 'JOB ROLE', worker.jobRole || '—'],
    ['SITE', siteName || '—', 'BUSINESS', businessName || '—'],
    ['WORKGROUP', worker.workgroup || '—', 'ROSTER', worker.rosterPattern || '—'],
    ['CONTEXT', formatAssessmentContext(worker.assessmentContext), 'DRIVING AFTER SHIFT', formatBool(worker.drivingAfterShift)],
    ['SHIFT START', fmtDateTime(worker.currentShiftStartAt), 'SHIFT END', fmtDateTime(worker.plannedShiftEndAt)],
    ['COMMUTE', worker.commuteDurationMinutes ? `${worker.commuteDurationMinutes} minutes` : '—', 'SUBMITTED', fmtDateTime(raw.submitted_at)],
  ])

  sectionHeader(doc, 'FATIGUE SELF-ASSESSMENT')
  twoColTable(doc, [
    ['SLEEP LAST 24H', `${worker.sleepHoursLast24h} hours`, 'SLEEP LAST 48H', `${worker.sleepHoursLast48h} hours`],
    ['HOURS AWAKE', `${worker.hoursAwakeByEndOfShift} hours`, 'ALERTNESS', formatAlertness(worker.alertnessRating)],
    ['ALCOHOL BEFORE SLEEP', formatAlcoholBand(worker.alcoholBeforeSleepBand), 'DROWSY MEDICATION / SUBSTANCE', formatBool(worker.drowsyMedicationOrSubstance)],
    ['STRESS / HEALTH ISSUE', formatBool(worker.stressOrHealthIssueAffectingSleepOrConcentration), 'WORKER COMMENTS', worker.workerComments || '—'],
  ])

  sectionHeader(doc, 'RISK SUMMARY')
  twoColTable(doc, [
    ['FATIGUE SCORE', String(summary.fatigueScoreTotal), 'RISK LEVEL', summary.derivedRiskLevel.toUpperCase()],
    ['HIGH-RISK RESPONSE', formatBool(summary.hasAnyHighRiskAnswer), 'STATUS', String(raw.status ?? 'resolved')],
  ])

  sectionHeader(doc, 'MEDIC OR ESO OUTCOME')
  twoColTable(doc, [
    ['DECISION', formatDecision(reviewPayload.fitForWorkDecision), 'REVIEWED', fmtDateTime(raw.reviewed_at)],
    ['REVIEWER', reviewPayload.reviewedByName || account.display_name || '—', 'SUPERVISOR NOTIFIED', formatBool(reviewPayload.supervisorNotified)],
    ['TRANSPORT ARRANGED', formatBool(reviewPayload.transportArranged), 'SENT TO ROOM', formatBool(reviewPayload.sentToRoom)],
    ['SENT HOME', formatBool(reviewPayload.sentHome), 'HIGHER MEDICAL REVIEW', formatBool(reviewPayload.requiresHigherMedicalReview)],
    ['FOLLOW-UP REQUIRED', formatBool(reviewPayload.requiresFollowUp), 'RESTRICTIONS', reviewPayload.restrictions || '—'],
    ['HANDOVER NOTES', reviewPayload.handoverNotes || '—'],
  ])
  renderAuditEntries(doc, 'MEDIC OR ESO COMMENTS', reviewPayload.medicOrEsoComments ? [{
    authorName: reviewPayload.reviewedByName || account.display_name,
    createdAt: raw.reviewed_at,
    note: reviewPayload.medicOrEsoComments,
    actionLabel: formatDecision(reviewPayload.fitForWorkDecision),
  }] : [])
  renderExportAuditSummary(doc, {
    exportedByName: account.display_name,
    exportedAt: exportRenderedAt,
    exportKind,
    firstExportedAt,
  })

  pageFooter(doc, 1, 1)
  doc.end()

  const pdfBuffer = await bufferPromise
  let persistedExportKind: 'first_export' | 're_export' = raw.exported_at ? 're_export' : 'first_export'
  let persistedFirstExportedAt: string | null = raw.exported_at ?? null

  if (!raw.exported_at) {
    const exportStamp = await markExportedIfNeeded({
      supabase,
      table: 'module_submissions',
      id,
      exportedByName: account.display_name,
      moduleKey: 'fatigue_assessment',
    })

    if (exportStamp.error) {
      await safeLogServerEvent({
        source: 'web_api',
        action: 'fatigue_pdf_exported',
        result: 'failure',
        actorUserId: user.id,
        actorRole: account.role,
        actorName: account.display_name,
        businessId: account.business_id,
        moduleKey: 'fatigue_assessment',
        route: '/api/fatigue-assessments/[id]/pdf',
        targetId: id,
        errorMessage: exportStamp.error.message,
      })
      return new NextResponse('Failed to record export audit state. Please try again.', { status: 500 })
    }

    if (exportStamp.stamped) {
      persistedFirstExportedAt = exportStamp.exportedAt
    } else {
      persistedExportKind = 're_export'
    }
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'fatigue_pdf_exported',
    result: 'success',
    actorUserId: user.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: account.business_id,
    moduleKey: 'fatigue_assessment',
    route: '/api/fatigue-assessments/[id]/pdf',
    targetId: id,
    context: {
      export_kind: persistedExportKind,
      first_exported_at: persistedFirstExportedAt,
    },
  })

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
