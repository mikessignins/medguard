import { NextRequest, NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { resolveBusinessLogoUrl } from '@/lib/business-logo'
import { hasMedicScopeAccess } from '@/lib/medic-scope'
import { parseUuidParam } from '@/lib/api-validation'
import { markExportedIfNeeded } from '@/lib/export-stamp'
import {
  formatPsychosocialPostIncidentEventType,
  formatPsychosocialContext,
  formatPsychosocialRiskLevel,
  formatPsychosocialWorkflowKind,
  getPsychosocialReviewHistory,
  getPsychosocialHazardSignals,
  getPsychosocialJobRole,
  getPsychosocialWorkerName,
  PSYCHOSOCIAL_HAZARDS,
  withPsychosocialWorkerNameFallback,
} from '@/lib/psychosocial'
import type { PsychosocialAssessment, PsychosocialReviewPayload } from '@/lib/types'
import { enforceActionRateLimit } from '@/lib/rate-limit'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { getWorkerDisplayNameById } from '@/lib/worker-account-names'
import { logAndReturnInternalError, NO_STORE_HEADERS } from '@/lib/api-security'
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
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params
  const parsedId = parseUuidParam(resolvedParams.id, 'Psychosocial assessment id')
  if (!parsedId.success) return parsedId.response

  try {
    return await generatePsychosocialPdf(parsedId.value)
  } catch (err) {
    return logAndReturnInternalError('/api/psychosocial-assessments/[id]/pdf', err)
  }
}

function formatBool(value: boolean | null | undefined) {
  return value ? 'Yes' : 'No'
}

async function generatePsychosocialPdf(id: string) {
  const auth = await getAuthenticatedMedic()
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })
  const { user, account, authClient } = auth

  const rateLimited = await enforceActionRateLimit({
    authClient,
    action: 'psychosocial_pdf_exported',
    actorUserId: user.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: account.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/[id]/pdf',
    targetId: id,
    limit: 10,
    windowMs: 5 * 60_000,
    errorMessage: 'Too many psychosocial PDF exports were requested. Please wait a few minutes and try again.',
  })
  if (rateLimited) return rateLimited

  const supabase = authClient

  const { data: raw, error } = await supabase
    .from('module_submissions')
    .select('*')
    .eq('id', id)
    .eq('module_key', 'psychosocial_health')
    .single()

  if (error || !raw) {
    return new NextResponse('Psychosocial support check-in not found', { status: 404 })
  }

  if (!hasMedicScopeAccess(account, raw)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const workflowKind = raw.payload?.workerPulse?.workflowKind
    ?? (raw.payload?.postIncidentWelfare ? 'post_incident_psychological_welfare' : null)

  if (!['support_check_in', 'post_incident_psychological_welfare'].includes(workflowKind ?? '')) {
    return new NextResponse(
      'Only reviewed psychosocial support and post-incident welfare cases can be exported.',
      { status: 422 },
    )
  }

  if (raw.is_test) {
    return new NextResponse(
      'This is a test psychosocial case and cannot be exported.',
      { status: 422 },
    )
  }

  if (raw.phi_purged_at) {
    return new NextResponse(
      'This psychosocial case has already been purged and can no longer be exported.',
      { status: 422 },
    )
  }

  if (raw.status !== 'resolved') {
    return new NextResponse(
      `Only resolved psychosocial cases can be exported. Current status: ${raw.status ?? 'Unknown'}.`,
      { status: 422 },
    )
  }

  const payload = raw.payload as PsychosocialAssessment['payload']
  const reviewPayload = (raw.review_payload as PsychosocialReviewPayload | null) ?? {}

  if (!reviewPayload.outcomeSummary) {
    return new NextResponse(
      'A completed review outcome is required before a psychosocial case can be exported.',
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
  const fallbackWorkerName = await getWorkerDisplayNameById(String(raw.worker_id ?? ''))

  let logoBuffer: Buffer | null = null
  const businessLogoUrl = resolveBusinessLogoUrl(business, 'light')
  if (businessLogoUrl) {
    try {
      const logoRes = await fetch(businessLogoUrl)
      if (logoRes.ok) logoBuffer = Buffer.from(await logoRes.arrayBuffer())
    } catch (error) {
      console.warn('[psychosocial/pdf] failed to fetch business logo', {
        assessmentId: id,
        businessId: raw.business_id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const assessment = withPsychosocialWorkerNameFallback({
    id: String(raw.id ?? ''),
    business_id: String(raw.business_id ?? ''),
    site_id: String(raw.site_id ?? ''),
    worker_id: String(raw.worker_id ?? ''),
    module_key: 'psychosocial_health',
    module_version: Number(raw.module_version ?? 1),
    status: raw.status as PsychosocialAssessment['status'],
    payload,
    review_payload: reviewPayload,
    submitted_at: String(raw.submitted_at ?? ''),
    reviewed_at: raw.reviewed_at ? String(raw.reviewed_at) : null,
    reviewed_by: raw.reviewed_by ? String(raw.reviewed_by) : null,
    exported_at: raw.exported_at ? String(raw.exported_at) : null,
    exported_by_name: raw.exported_by_name ? String(raw.exported_by_name) : null,
    phi_purged_at: raw.phi_purged_at ? String(raw.phi_purged_at) : null,
    is_test: typeof raw.is_test === 'boolean' ? raw.is_test : null,
  }, fallbackWorkerName)

  const worker = assessment.payload.workerPulse ?? null
  const welfare = assessment.payload.postIncidentWelfare ?? null
  if (!worker && !welfare) {
    return new NextResponse('Psychosocial workflow payload not found for export.', { status: 422 })
  }
  const summary = assessment.payload.scoreSummary
  const hazardLabels = getPsychosocialHazardSignals({
    payload: assessment.payload,
  } as Pick<PsychosocialAssessment, 'payload'>).map(
    (key) => PSYCHOSOCIAL_HAZARDS.find((hazard) => hazard.key === key)?.label ?? key,
  )

  const fullName = getPsychosocialWorkerName(assessment).trim() || 'Unknown'
  const dateStr = raw.submitted_at ? String(raw.submitted_at).slice(0, 10) : new Date().toISOString().slice(0, 10)
  const filename = sanitize(`${fullName} - ${formatPsychosocialWorkflowKind(workflowKind as NonNullable<typeof workflowKind>)} - ${dateStr} - ${siteName} - ${businessName}`) + '.pdf'

  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true, autoFirstPage: false })
  const bufferPromise = streamToBuffer(doc)
  const exportRenderedAt = new Date().toISOString()
  const exportKind = raw.exported_at ? 're_export' : 'first_export'
  const firstExportedAt = raw.exported_at ?? exportRenderedAt

  doc.addPage()
  pageHeader(doc, logoBuffer, formatPsychosocialWorkflowKind(workflowKind as NonNullable<typeof workflowKind>).toUpperCase())

  doc.font(F_BOLD).fontSize(16).fillColor('#000')
    .text(formatPsychosocialWorkflowKind(workflowKind as NonNullable<typeof workflowKind>).toUpperCase(), MARGIN, doc.y, { width: CONTENT_W })
  doc.y += 4
  doc.font(F_REGULAR).fontSize(8).fillColor('#000')
    .text(
      workflowKind === 'post_incident_psychological_welfare'
        ? 'This record captures a medic-led post-incident psychological welfare case and the resulting review and follow-up actions.'
        : 'This record captures an identifiable worker psychosocial support check-in and the medic or welfare review outcome. Routine de-identified wellbeing pulse entries are excluded from this export path.',
      MARGIN,
      doc.y,
      { width: CONTENT_W },
    )
  doc.y += 8

  sectionHeader(doc, 'WORKER CONTEXT')
  if (worker) {
    twoColTable(doc, [
      ['WORKER', worker.workerNameSnapshot || '—', 'JOB ROLE', worker.jobRole || '—'],
      ['SITE', siteName || '—', 'BUSINESS', businessName || '—'],
      ['WORKGROUP', worker.workgroup || '—', 'ROSTER', worker.rosterPattern || '—'],
      ['CONTEXT', formatPsychosocialContext(worker.submissionContext), 'FIFO / REMOTE', formatBool(worker.isFIFO)],
      ['SUBMITTED', fmtDateTime(raw.submitted_at), 'REVIEWED', fmtDateTime(raw.reviewed_at)],
    ])

    sectionHeader(doc, 'WORKER RESPONSES')
    twoColTable(doc, [
      ['MOOD /5', String(worker.moodRating), 'STRESS /5', String(worker.stressRating)],
      ['SLEEP /5', String(worker.sleepQualityOnRoster), 'SUPPORT REQUESTED', formatBool(summary.requestedSupport)],
      ['URGENT CONTACT TODAY', formatBool(worker.wouldLikeUrgentContactToday), 'UNSAFE AT WORK TODAY', formatBool(worker.feelsUnsafeAtWorkToday)],
      ['COMFORT SPEAKING TO MEDIC', formatBool(worker.comfortableSpeakingToMedic), 'COMFORT SPEAKING TO COUNSELLOR', formatBool(worker.comfortableSpeakingToCounsellor)],
      ['WORKER COMMENTS', worker.workerComments || '—', 'RISK LEVEL', formatPsychosocialRiskLevel(summary.derivedPulseRiskLevel)],
    ])
  } else if (welfare) {
    twoColTable(doc, [
      ['WORKER', welfare.workerNameSnapshot || '—', 'JOB ROLE', welfare.jobRole || getPsychosocialJobRole(assessment) || '—'],
      ['SITE', siteName || '—', 'BUSINESS', businessName || '—'],
      ['EVENT TYPE', formatPsychosocialPostIncidentEventType(welfare.eventType), 'EVENT TIME', fmtDateTime(welfare.eventDateTime)],
      ['LINKED INCIDENT', welfare.linkedIncidentOrCaseId || '—', 'FOLLOW-UP SCHEDULED', fmtDateTime(welfare.followUpScheduledAt)],
      ['SUBMITTED', fmtDateTime(raw.submitted_at), 'REVIEWED', fmtDateTime(raw.reviewed_at)],
    ])

    sectionHeader(doc, 'POST-INCIDENT WELFARE DETAILS')
    twoColTable(doc, [
      ['NATURE OF EXPOSURE', welfare.natureOfExposure, 'INITIAL DEFUSING OFFERED', formatBool(welfare.initialDefusingOffered)],
      ['NORMAL REACTIONS EXPLAINED', formatBool(welfare.normalReactionsExplained), 'SUPPORT PERSON CONTACTED', formatBool(welfare.supportPersonContacted)],
      ['EAP REFERRAL OFFERED', formatBool(welfare.eapReferralOffered), 'EXTERNAL PSYCHOLOGY REFERRAL', formatBool(welfare.externalPsychologyReferralOffered)],
      ['CONFIDENTIALITY ACKNOWLEDGED', formatBool(welfare.confidentialityAcknowledged), 'INITIAL NOTES', welfare.reviewNotes || '—'],
    ])
  }

  sectionHeader(doc, 'HAZARD SIGNALS')
  twoColTable(doc, [
    ['MAPPED HAZARDS', hazardLabels.length > 0 ? hazardLabels.join(', ') : 'No grouped hazard signals mapped', 'REQUIRES URGENT FOLLOW-UP', formatBool(summary.requiresUrgentFollowUp)],
  ])

  sectionHeader(doc, 'REVIEW OUTCOME')
  twoColTable(doc, [
    ['REVIEWER', reviewPayload.reviewedByName || account.display_name || '—', 'FOLLOW-UP REQUIRED', formatBool(reviewPayload.followUpRequired)],
    ['OUTCOME SUMMARY', reviewPayload.outcomeSummary || '—', 'SUPPORT ACTIONS', reviewPayload.supportActions || '—'],
    ['CONTACT OUTCOME', reviewPayload.contactOutcome || '—', 'FOLLOW-UP SCHEDULED', fmtDateTime(reviewPayload.followUpScheduledAt)],
    ['STATUS', String(raw.status ?? 'resolved')],
  ])
  renderAuditEntries(doc, 'REVIEW COMMENTS', getPsychosocialReviewHistory(assessment).map((entry) => ({
    authorName: entry.createdByName,
    createdAt: entry.createdAt,
    note: entry.note,
    actionLabel: entry.actionLabel,
  })))
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
      moduleKey: 'psychosocial_health',
    })

    if (exportStamp.error) {
      await safeLogServerEvent({
        source: 'web_api',
        action: 'psychosocial_pdf_exported',
        result: 'failure',
        actorUserId: user.id,
        actorRole: account.role,
        actorName: account.display_name,
        businessId: account.business_id,
        moduleKey: 'psychosocial_health',
        route: '/api/psychosocial-assessments/[id]/pdf',
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
    action: 'psychosocial_pdf_exported',
    result: 'success',
    actorUserId: user.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: account.business_id,
    moduleKey: 'psychosocial_health',
    route: '/api/psychosocial-assessments/[id]/pdf',
    targetId: id,
    context: {
      export_kind: persistedExportKind,
      first_exported_at: persistedFirstExportedAt,
    },
  })

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
