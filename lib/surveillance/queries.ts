import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getRequestBusiness, getRequestBusinessModules } from '@/lib/supabase/request-cache'
import { HEALTH_SURVEILLANCE_MODULE_KEY, isBusinessModuleEnabled, type BusinessModule } from '@/lib/modules'
import { canAccessSurveillanceDashboard, canManageSurveillance } from '@/lib/auth/roles'
import { formatDate } from '@/lib/date-format'
import {
  isOnSiteOnDate,
  nextFlyIn,
  nextFlyOut,
} from '@/lib/surveillance/swing-schedule'
import type { CycleSegment } from '@/lib/surveillance/roster-patterns'
import type {
  BusinessWorkerRole,
  SurveillanceAppointment,
  SurveillanceDashboardMetrics,
  SurveillanceEnrolment,
  SurveillanceNotification,
  SurveillanceNotificationRecipient,
  SurveillanceEscalationPolicy,
  SurveillanceOutcomeMinimal,
  SurveillanceProvider,
  SurveillanceProviderLocation,
  SurveillanceProgram,
  SurveillanceReasonCode,
  SurveillanceType,
  SurveillanceReviewTask,
  SurveillanceWorkerAvailabilityException,
  SurveillanceWorkerRoster,
  SurveillanceWorker,
  UserRole,
} from '@/lib/types'

interface SurveillanceAccount {
  id: string
  display_name: string
  role: UserRole
  business_id: string
  is_inactive?: boolean | null
  contract_end_date?: string | null
}

export interface SurveillanceContext {
  userId: string
  account: SurveillanceAccount
  business: Awaited<ReturnType<typeof getRequestBusiness>>
  moduleEnabled: boolean
}

export interface SurveillanceDashboardData {
  context: SurveillanceContext
  metrics: SurveillanceDashboardMetrics
  complianceSummary: SurveillanceComplianceSummary
  queueSummary: SurveillanceQueueSummary
  openEscalationCount: number
  workerLookup: Array<{
    id: string
    displayName: string
    role: string
    siteName: string | null
    complianceStatus: SurveillanceComplianceStatus
    nextDueAt: string | null
    rosterLabel: string
  }>
  actionWorkers: {
    overdueOnSite: SurveillanceEligibleWorker[]
    dueSoonOnSite: SurveillanceEligibleWorker[]
    reviewTasks: SurveillanceEligibleWorker[]
    availability: SurveillanceEligibleWorker[]
    missingRoster: SurveillanceEligibleWorker[]
  }
  todayAppointments: SurveillanceAppointmentWithRequirement[]
  upcomingAppointments: SurveillanceAppointmentWithRequirement[]
  dueSoonEnrolments: SurveillanceEnrolmentWithRequirement[]
  overdueEnrolments: SurveillanceEnrolmentWithRequirement[]
  completedThisWeek: SurveillanceAppointmentWithRequirement[]
  priorityWorkers: Record<'overdue' | 'baseline' | 'due-soon' | 'review-tasks' | 'availability', SurveillanceEligibleWorker[]>
}

export type SurveillanceComplianceStatus = 'green' | 'amber' | 'red' | 'grey'
export type SurveillanceComplianceReason =
  | 'no_active_assignments'
  | 'baseline_incomplete'
  | 'overdue'
  | 'due_soon'
  | 'current'
export type SurveillanceQueueKind =
  | 'all'
  | 'overdue'
  | 'baseline'
  | 'due-soon'
  | 'review-tasks'
  | 'availability'

export interface SurveillanceComplianceSummary {
  green: number
  amber: number
  red: number
  grey: number
  total: number
  fullyCurrentPercent: number
}

export interface SurveillanceQueueSummary {
  all: number
  overdue: number
  baseline: number
  dueSoon: number
  reviewTasks: number
  availability: number
}

export interface SurveillanceSiteReportRow {
  siteId: string | null
  siteName: string
  workerCount: number
  green: number
  amber: number
  red: number
  grey: number
}

export interface SurveillanceRequirementReportRow {
  requirementId: string
  requirementName: string
  activeEnrolments: number
  baselineIncomplete: number
  dueSoon: number
  overdue: number
  noDueDate: number
}

export interface SurveillanceProviderReportRow {
  providerId: string | null
  providerName: string
  providerLocationId: string | null
  providerLocationName: string
  scheduled: number
  completed: number
  didNotAttend: number
  cancelled: number
}

export interface SurveillanceRequirementSummary {
  id: string
  code: string
  name: string
  interval_days: number | null
  source: 'surveillance_type' | 'program'
}

export interface SurveillanceAppointmentWithRequirement extends SurveillanceAppointment {
  program: Pick<SurveillanceProgram, 'id' | 'code' | 'name' | 'interval_days'> | null
  surveillanceType: Pick<SurveillanceType, 'id' | 'code' | 'name' | 'default_interval_days'> | null
  requirement: SurveillanceRequirementSummary | null
}

export interface SurveillanceEnrolmentWithRequirement extends SurveillanceEnrolment {
  program: Pick<SurveillanceProgram, 'id' | 'code' | 'name' | 'interval_days'> | null
  surveillanceType: Pick<SurveillanceType, 'id' | 'code' | 'name' | 'default_interval_days'> | null
  requirement: SurveillanceRequirementSummary | null
}

export interface SurveillanceWorkerDetail {
  context: SurveillanceContext
  workerId: string
  workerDisplayName: string
  worker: SurveillanceEligibleWorker | null
  availablePrograms: SurveillanceProgram[]
  availableSurveillanceTypes: SurveillanceType[]
  availableProviders: SurveillanceProvider[]
  availableProviderLocations: SurveillanceProviderLocation[]
  availableReasonCodes: SurveillanceReasonCode[]
  roster: SurveillanceWorkerRoster | null
  availabilityExceptions: SurveillanceWorkerAvailabilityException[]
  reviewTasks: SurveillanceReviewTask[]
  enrolments: SurveillanceEnrolmentWithRequirement[]
  appointments: SurveillanceAppointmentWithRequirement[]
  outcomes: SurveillanceOutcomeMinimal[]
}

export interface SurveillanceAppointmentDetail {
  context: SurveillanceContext
  appointment: SurveillanceAppointmentWithRequirement
  enrolment: SurveillanceEnrolmentWithRequirement | null
  outcome: SurveillanceOutcomeMinimal | null
  availableProviders: SurveillanceProvider[]
  availableProviderLocations: SurveillanceProviderLocation[]
  availableReasonCodes: SurveillanceReasonCode[]
}

export interface SurveillanceProviderDetail {
  context: SurveillanceContext
  provider: SurveillanceProvider
  providerLocations: SurveillanceProviderLocation[]
  availableSites: Array<{ id: string; name: string }>
}

export interface SurveillanceNotificationWithRecipients extends SurveillanceNotification {
  recipients: SurveillanceNotificationRecipient[]
  workerDisplayName: string | null
}

export interface SurveillanceEscalationQueueItem extends SurveillanceNotificationWithRecipients {
  daysOpen: number
}

export const SURVEILLANCE_ESCALATION_TYPES = [
  'escalation_occ_health',
  'escalation_supervisor',
  'escalation_manager',
] as const

export const DEFAULT_SURVEILLANCE_ESCALATION_POLICY: Omit<
  SurveillanceEscalationPolicy,
  'business_id' | 'created_at' | 'updated_by' | 'updated_at'
> = {
  due_soon_days: 30,
  occ_health_overdue_days: 0,
  supervisor_overdue_days: 7,
  manager_overdue_days: 14,
  is_active: true,
}

export interface SurveillanceEligibleWorker extends SurveillanceWorker {
  selectedRole: Pick<BusinessWorkerRole, 'id' | 'name'> | null
  activeEnrolmentCount: number
  complianceStatus: SurveillanceComplianceStatus
  complianceReason: SurveillanceComplianceReason
  roster: SurveillanceWorkerRoster | null
  currentAvailabilityException: SurveillanceWorkerAvailabilityException | null
  openReviewTaskCount: number
  nextDueAt: string | null
  nextAppointmentAt: string | null
  nextAppointmentStatus: SurveillanceAppointment['status'] | null
  nextAppointmentId: string | null
  primaryProgram: Pick<SurveillanceProgram, 'id' | 'code' | 'name' | 'interval_days'> | null
  primarySurveillanceType: Pick<SurveillanceType, 'id' | 'code' | 'name' | 'default_interval_days'> | null
  primaryRequirement: SurveillanceRequirementSummary | null
}

type ProgramSummary = Pick<SurveillanceProgram, 'id' | 'code' | 'name' | 'interval_days'>
type SurveillanceTypeSummary = Pick<SurveillanceType, 'id' | 'code' | 'name' | 'default_interval_days'>

const AMBER_WINDOW_DAYS = 30
const COMPLIANCE_SORT_ORDER: Record<SurveillanceComplianceStatus, number> = {
  red: 0,
  grey: 1,
  amber: 2,
  green: 3,
}

function getPerthTodayBounds(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  const today = `${year}-${month}-${day}`
  const tomorrow = new Date(`${today}T00:00:00+08:00`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  return {
    startsAt: new Date(`${today}T00:00:00+08:00`).toISOString(),
    endsAt: tomorrow.toISOString(),
  }
}

function isRosterCycle(value: SurveillanceWorkerRoster['roster_cycle_json']): value is CycleSegment[] {
  return Array.isArray(value) && value.every((segment) => (
    typeof segment.days === 'number' && segment.days > 0 && (segment.period === 'on' || segment.period === 'off')
  ))
}

function getWorkerRosterStatus(worker: SurveillanceEligibleWorker, referenceDate = new Date()) {
  if (worker.currentAvailabilityException) {
    return 'unavailable'
  }

  if (!worker.roster?.anchor_date || !isRosterCycle(worker.roster.roster_cycle_json)) {
    return 'missing_roster'
  }

  const anchorDate = new Date(`${worker.roster.anchor_date}T00:00:00`)
  if (Number.isNaN(anchorDate.getTime())) {
    return 'missing_roster'
  }

  return isOnSiteOnDate(anchorDate, worker.roster.roster_cycle_json, referenceDate) ? 'on_site' : 'off_site'
}

export function getWorkerRosterAvailabilityLabel(worker: SurveillanceEligibleWorker, referenceDate = new Date()) {
  if (worker.currentAvailabilityException) {
    return `Unavailable: ${worker.currentAvailabilityException.exception_type.replaceAll('_', ' ')} until ${formatDate(worker.currentAvailabilityException.ends_at)}`
  }

  if (!worker.roster?.anchor_date || !isRosterCycle(worker.roster.roster_cycle_json)) {
    return 'No roster recorded'
  }

  const anchorDate = new Date(`${worker.roster.anchor_date}T00:00:00`)
  if (Number.isNaN(anchorDate.getTime())) {
    return 'No roster recorded'
  }

  if (isOnSiteOnDate(anchorDate, worker.roster.roster_cycle_json, referenceDate)) {
    const flyOut = nextFlyOut(anchorDate, worker.roster.roster_cycle_json, referenceDate)
    return flyOut ? `On site until ${formatDate(flyOut.toISOString())}` : 'On site'
  }

  const flyIn = nextFlyIn(anchorDate, worker.roster.roster_cycle_json, referenceDate)
  return flyIn ? `R&R - returns ${formatDate(flyIn.toISOString())}` : 'R&R'
}

async function getAuthenticatedSurveillanceContext(): Promise<SurveillanceContext | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: account } = await supabase
    .from('user_accounts')
    .select('id, display_name, role, business_id, is_inactive, contract_end_date')
    .eq('id', user.id)
    .single<SurveillanceAccount>()

  if (!account || !canAccessSurveillanceDashboard(account)) {
    return null
  }

  const [business, modules] = await Promise.all([
    getRequestBusiness(account.business_id),
    getRequestBusinessModules(account.business_id),
  ])

  return {
    userId: user.id,
    account,
    business,
    moduleEnabled: isBusinessModuleEnabled(modules as BusinessModule[], HEALTH_SURVEILLANCE_MODULE_KEY),
  }
}

async function getMetrics(supabase: Awaited<ReturnType<typeof createClient>>, businessId: string) {
  const { data, error } = await supabase.rpc('get_surveillance_dashboard_metrics', {
    p_business_id: businessId,
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data

  return {
    upcoming_count: Number(row?.upcoming_count ?? 0),
    due_soon_count: Number(row?.due_soon_count ?? 0),
    overdue_count: Number(row?.overdue_count ?? 0),
    completed_today_count: Number(row?.completed_today_count ?? 0),
    completed_week_count: Number(row?.completed_week_count ?? 0),
    active_enrolment_count: Number(row?.active_enrolment_count ?? 0),
  } satisfies SurveillanceDashboardMetrics
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function deriveWorkerCompliance(enrolments: SurveillanceEnrolment[]): {
  status: SurveillanceComplianceStatus
  reason: SurveillanceComplianceReason
} {
  const activeEnrolments = enrolments.filter((enrolment) => enrolment.status === 'active')
  if (activeEnrolments.length === 0) {
    return { status: 'grey', reason: 'no_active_assignments' }
  }

  if (activeEnrolments.some((enrolment) => enrolment.baseline_required && !enrolment.baseline_completed_at)) {
    return { status: 'grey', reason: 'baseline_incomplete' }
  }

  const now = Date.now()
  const amberCutoff = now + AMBER_WINDOW_DAYS * 24 * 60 * 60 * 1000

  const dueTimes = activeEnrolments
    .map((enrolment) => toTimestamp(enrolment.next_due_at))
    .filter((value): value is number => value !== null)

  if (dueTimes.some((dueAt) => dueAt < now)) {
    return { status: 'red', reason: 'overdue' }
  }

  if (dueTimes.some((dueAt) => dueAt <= amberCutoff)) {
    return { status: 'amber', reason: 'due_soon' }
  }

  return { status: 'green', reason: 'current' }
}

function isDueSoonTimestamp(timestamp: number | null, now = Date.now()) {
  return timestamp !== null && timestamp >= now && timestamp <= now + AMBER_WINDOW_DAYS * 24 * 60 * 60 * 1000
}

function matchesQueueKind(worker: SurveillanceEligibleWorker, queueKind: SurveillanceQueueKind) {
  switch (queueKind) {
    case 'all':
      return true
    case 'overdue':
      return worker.complianceStatus === 'red'
    case 'baseline':
      return worker.complianceReason === 'baseline_incomplete'
    case 'due-soon':
      return worker.complianceReason === 'due_soon'
    case 'review-tasks':
      return worker.openReviewTaskCount > 0
    case 'availability':
      return Boolean(worker.currentAvailabilityException)
    default:
      return true
  }
}

async function getComplianceSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<SurveillanceComplianceSummary> {
  const [workersResult, enrolmentsResult] = await Promise.all([
    supabase
      .from('surveillance_workers')
      .select('id')
      .eq('business_id', businessId)
      .eq('requires_health_surveillance', true)
      .eq('is_active', true),
    supabase
      .from('surveillance_enrolments')
      .select('surveillance_worker_id, status, next_due_at, baseline_required, baseline_completed_at')
      .eq('business_id', businessId),
  ])

  if (workersResult.error) throw workersResult.error
  if (enrolmentsResult.error) throw enrolmentsResult.error

  const workers = (workersResult.data ?? []) as Array<Pick<SurveillanceWorker, 'id'>>
  const enrolments = (enrolmentsResult.data ?? []) as Array<
    Pick<
      SurveillanceEnrolment,
      'surveillance_worker_id' | 'status' | 'next_due_at' | 'baseline_required' | 'baseline_completed_at'
    >
  >

  const summary: SurveillanceComplianceSummary = {
    green: 0,
    amber: 0,
    red: 0,
    grey: 0,
    total: workers.length,
    fullyCurrentPercent: 0,
  }

  for (const worker of workers) {
    const status = deriveWorkerCompliance(
      enrolments.filter((enrolment) => enrolment.surveillance_worker_id === worker.id) as SurveillanceEnrolment[],
    ).status
    summary[status] += 1
  }

  summary.fullyCurrentPercent = summary.total > 0 ? Math.round((summary.green / summary.total) * 100) : 0

  return summary
}

async function getProgramMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
) {
  const { data, error } = await supabase
    .from('surveillance_programs')
    .select('id, code, name, interval_days')
    .eq('business_id', businessId)

  if (error) throw error

  return new Map(
    ((data ?? []) as ProgramSummary[]).map((program) => [program.id, program]),
  )
}

async function getSurveillanceTypeMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
) {
  const { data, error } = await supabase
    .from('surveillance_types')
    .select('id, code, name, default_interval_days')
    .eq('business_id', businessId)
    .eq('is_active', true)

  if (error) {
    console.warn('[surveillance] surveillance_types unavailable, falling back to legacy programs', {
      businessId,
      message: error.message,
    })
    return new Map<string, SurveillanceTypeSummary>()
  }

  return new Map(
    ((data ?? []) as SurveillanceTypeSummary[]).map((surveillanceType) => [surveillanceType.id, surveillanceType]),
  )
}

async function listSurveillanceProviders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<SurveillanceProvider[]> {
  const { data, error } = await supabase
    .from('surveillance_providers')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) {
    console.warn('[surveillance] surveillance_providers unavailable, falling back to empty provider list', {
      businessId,
      message: error.message,
    })
    return []
  }

  return (data ?? []) as SurveillanceProvider[]
}

async function listSurveillanceProviderLocations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<SurveillanceProviderLocation[]> {
  const { data, error } = await supabase
    .from('surveillance_provider_locations')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('location_name', { ascending: true })

  if (error) {
    console.warn('[surveillance] surveillance_provider_locations unavailable, falling back to empty location list', {
      businessId,
      message: error.message,
    })
    return []
  }

  return (data ?? []) as SurveillanceProviderLocation[]
}

async function listSurveillanceReasonCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
): Promise<SurveillanceReasonCode[]> {
  const { data, error } = await supabase
    .from('surveillance_reason_codes')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('label', { ascending: true })

  if (error) {
    console.warn('[surveillance] surveillance_reason_codes unavailable, falling back to empty reason-code list', {
      businessId,
      message: error.message,
    })
    return []
  }

  return (data ?? []) as SurveillanceReasonCode[]
}

function getRequirementSummary(
  program: ProgramSummary | null,
  surveillanceType: SurveillanceTypeSummary | null,
): SurveillanceRequirementSummary | null {
  if (surveillanceType) {
    return {
      id: surveillanceType.id,
      code: surveillanceType.code,
      name: surveillanceType.name,
      interval_days: surveillanceType.default_interval_days,
      source: 'surveillance_type',
    }
  }

  if (program) {
    return {
      id: program.id,
      code: program.code,
      name: program.name,
      interval_days: program.interval_days,
      source: 'program',
    }
  }

  return null
}

function attachRequirementToAppointments(
  appointments: SurveillanceAppointment[],
  programMap: Map<string, ProgramSummary>,
  surveillanceTypeMap: Map<string, SurveillanceTypeSummary>,
): SurveillanceAppointmentWithRequirement[] {
  return appointments.map((appointment) => ({
    ...appointment,
    program: programMap.get(appointment.program_id) ?? null,
    surveillanceType: appointment.surveillance_type_id
      ? surveillanceTypeMap.get(appointment.surveillance_type_id) ?? null
      : null,
    requirement: getRequirementSummary(
      programMap.get(appointment.program_id) ?? null,
      appointment.surveillance_type_id ? surveillanceTypeMap.get(appointment.surveillance_type_id) ?? null : null,
    ),
  }))
}

function attachRequirementToEnrolments(
  enrolments: SurveillanceEnrolment[],
  programMap: Map<string, ProgramSummary>,
  surveillanceTypeMap: Map<string, SurveillanceTypeSummary>,
): SurveillanceEnrolmentWithRequirement[] {
  return enrolments.map((enrolment) => ({
    ...enrolment,
    program: programMap.get(enrolment.program_id) ?? null,
    surveillanceType: enrolment.surveillance_type_id
      ? surveillanceTypeMap.get(enrolment.surveillance_type_id) ?? null
      : null,
    requirement: getRequirementSummary(
      programMap.get(enrolment.program_id) ?? null,
      enrolment.surveillance_type_id ? surveillanceTypeMap.get(enrolment.surveillance_type_id) ?? null : null,
    ),
  }))
}

async function getRoleMap(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
) {
  const roleClient = createServiceClient()
  const { data, error } = await roleClient
    .from('business_worker_roles')
    .select('id, name')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) throw error

  return new Map(
    ((data ?? []) as Pick<BusinessWorkerRole, 'id' | 'name'>[]).map((role) => [role.id, role]),
  )
}

async function loadEligibleWorkers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  programMap: Map<string, ProgramSummary>,
  surveillanceTypeMap: Map<string, SurveillanceTypeSummary>,
  search?: string,
  complianceStatus?: SurveillanceComplianceStatus,
  limit = 12,
): Promise<SurveillanceEligibleWorker[]> {
  let workersQuery = supabase
    .from('surveillance_workers')
    .select('*')
    .eq('business_id', businessId)
    .eq('requires_health_surveillance', true)
    .eq('is_active', true)
    .order('display_name', { ascending: true })
    .limit(limit)

  const trimmedSearch = search?.trim()
  if (trimmedSearch) {
    const escaped = trimmedSearch.replaceAll(',', ' ')
    workersQuery = workersQuery.or(`display_name.ilike.%${escaped}%,job_role_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
  }

  const [workersResult, roleMap] = await Promise.all([
    workersQuery,
    getRoleMap(supabase, businessId),
  ])

  if (workersResult.error) throw workersResult.error

  const workers = (workersResult.data ?? []) as SurveillanceWorker[]
  if (workers.length === 0) return []

  const workerIds = workers.map((worker) => worker.id)

  const [enrolmentsResult, appointmentsResult, rostersResult, availabilityResult, reviewTasksResult] = await Promise.all([
    supabase
      .from('surveillance_enrolments')
      .select('*')
      .eq('business_id', businessId)
      .in('surveillance_worker_id', workerIds)
      .order('enrolled_at', { ascending: false }),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', businessId)
      .in('surveillance_worker_id', workerIds)
      .in('status', ['scheduled', 'confirmed', 'rescheduled'])
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('surveillance_worker_rosters')
      .select('*')
      .eq('business_id', businessId)
      .in('surveillance_worker_id', workerIds)
      .order('updated_at', { ascending: false }),
    supabase
      .from('surveillance_worker_availability_exceptions')
      .select('*')
      .eq('business_id', businessId)
      .in('surveillance_worker_id', workerIds)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: false }),
    supabase
      .from('surveillance_review_tasks')
      .select('*')
      .eq('business_id', businessId)
      .in('surveillance_worker_id', workerIds)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false }),
  ])

  if (enrolmentsResult.error) throw enrolmentsResult.error
  if (appointmentsResult.error) throw appointmentsResult.error
  if (rostersResult.error && !(rostersResult.error.message.includes('relation') && rostersResult.error.message.includes('surveillance_worker_rosters'))) {
    throw rostersResult.error
  }
  if (availabilityResult.error && !(availabilityResult.error.message.includes('relation') && availabilityResult.error.message.includes('surveillance_worker_availability_exceptions'))) {
    throw availabilityResult.error
  }
  if (reviewTasksResult.error && !(reviewTasksResult.error.message.includes('relation') && reviewTasksResult.error.message.includes('surveillance_review_tasks'))) {
    throw reviewTasksResult.error
  }

  const enrolments = (enrolmentsResult.data ?? []) as SurveillanceEnrolment[]
  const appointments = (appointmentsResult.data ?? []) as SurveillanceAppointment[]
  const rosters = (rostersResult.data ?? []) as SurveillanceWorkerRoster[]
  const availabilityExceptions = (availabilityResult.data ?? []) as SurveillanceWorkerAvailabilityException[]
  const reviewTasks = (reviewTasksResult.data ?? []) as SurveillanceReviewTask[]

  const hydratedWorkers = workers.map((worker) => {
    const workerEnrolments = enrolments.filter((enrolment) => enrolment.surveillance_worker_id === worker.id)
    const activeEnrolments = workerEnrolments.filter((enrolment) => enrolment.status === 'active')
    const compliance = deriveWorkerCompliance(workerEnrolments)
    const roster = rosters.find((entry) => entry.surveillance_worker_id === worker.id) ?? null
    const currentAvailabilityException = availabilityExceptions.find((entry) => entry.surveillance_worker_id === worker.id) ?? null
    const openReviewTaskCount = reviewTasks.filter((entry) => entry.surveillance_worker_id === worker.id).length
    const nextDueAt = activeEnrolments
      .map((enrolment) => enrolment.next_due_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null
    const nextAppointment = appointments.find((appointment) => appointment.surveillance_worker_id === worker.id) ?? null
    const primaryEnrolment = activeEnrolments[0] ?? workerEnrolments[0] ?? null

    return {
      ...worker,
      selectedRole: worker.selected_worker_role_id ? roleMap.get(worker.selected_worker_role_id) ?? null : null,
      activeEnrolmentCount: activeEnrolments.length,
      complianceStatus: compliance.status,
      complianceReason: compliance.reason,
      roster,
      currentAvailabilityException,
      openReviewTaskCount,
      nextDueAt,
      nextAppointmentAt: nextAppointment?.scheduled_at ?? null,
      nextAppointmentStatus: nextAppointment?.status ?? null,
      nextAppointmentId: nextAppointment?.id ?? null,
      primaryProgram: primaryEnrolment ? programMap.get(primaryEnrolment.program_id) ?? null : null,
      primarySurveillanceType: primaryEnrolment?.surveillance_type_id
        ? surveillanceTypeMap.get(primaryEnrolment.surveillance_type_id) ?? null
        : null,
      primaryRequirement: primaryEnrolment
        ? getRequirementSummary(
            programMap.get(primaryEnrolment.program_id) ?? null,
            primaryEnrolment.surveillance_type_id
              ? surveillanceTypeMap.get(primaryEnrolment.surveillance_type_id) ?? null
              : null,
          )
        : null,
      }
  })

  return hydratedWorkers
    .filter((worker) => (complianceStatus ? worker.complianceStatus === complianceStatus : true))
    .sort((a, b) => {
      const statusDelta = COMPLIANCE_SORT_ORDER[a.complianceStatus] - COMPLIANCE_SORT_ORDER[b.complianceStatus]
      if (statusDelta !== 0) return statusDelta

      const dueA = toTimestamp(a.nextDueAt) ?? Number.MAX_SAFE_INTEGER
      const dueB = toTimestamp(b.nextDueAt) ?? Number.MAX_SAFE_INTEGER
      if (dueA !== dueB) return dueA - dueB

      return a.display_name.localeCompare(b.display_name)
    })
}

export async function getSurveillanceContext() {
  return getAuthenticatedSurveillanceContext()
}

export async function getSurveillanceDashboardData(
  search?: string,
  complianceStatus?: SurveillanceComplianceStatus,
): Promise<SurveillanceDashboardData | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled) return null

  const supabase = await createClient()
  const businessId = context.account.business_id
  const trimmedSearch = search?.trim()
  const todayBounds = getPerthTodayBounds()
  const [metrics, complianceSummary, programMap, surveillanceTypeMap] = await Promise.all([
    getMetrics(supabase, businessId),
    getComplianceSummary(supabase, businessId),
    getProgramMap(supabase, businessId),
    getSurveillanceTypeMap(supabase, businessId),
  ])

  const [todayAppointmentsResult, upcomingResult, dueSoonResult, overdueResult, completedResult, allWorkers, baselineCountResult, reviewTaskCountResult, availabilityCountResult, escalationCountResult] = await Promise.all([
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', businessId)
      .in('status', ['scheduled', 'confirmed', 'rescheduled'])
      .gte('scheduled_at', todayBounds.startsAt)
      .lt('scheduled_at', todayBounds.endsAt)
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', businessId)
      .in('status', ['scheduled', 'confirmed', 'rescheduled'])
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(8),
    supabase
      .from('surveillance_enrolments')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .not('next_due_at', 'is', null)
      .gte('next_due_at', new Date().toISOString())
      .lt('next_due_at', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString())
      .order('next_due_at', { ascending: true })
      .limit(8),
    supabase
      .from('surveillance_enrolments')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .not('next_due_at', 'is', null)
      .lt('next_due_at', new Date().toISOString())
      .order('next_due_at', { ascending: true })
      .limit(8),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('completed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('completed_at', { ascending: false })
      .limit(8),
    loadEligibleWorkers(supabase, businessId, programMap, surveillanceTypeMap, trimmedSearch, complianceStatus, 200),
    supabase
      .from('surveillance_enrolments')
      .select('surveillance_worker_id')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .eq('baseline_required', true)
      .is('baseline_completed_at', null),
    supabase
      .from('surveillance_review_tasks')
      .select('surveillance_worker_id')
      .eq('business_id', businessId)
      .in('status', ['open', 'in_progress']),
    supabase
      .from('surveillance_worker_availability_exceptions')
      .select('surveillance_worker_id')
      .eq('business_id', businessId)
      .lte('starts_at', new Date().toISOString())
      .gte('ends_at', new Date().toISOString()),
    supabase
      .from('surveillance_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('notification_type', [...SURVEILLANCE_ESCALATION_TYPES])
      .in('delivery_status', ['pending', 'sent']),
  ])

  if (todayAppointmentsResult.error) throw todayAppointmentsResult.error
  if (upcomingResult.error) throw upcomingResult.error
  if (dueSoonResult.error) throw dueSoonResult.error
  if (overdueResult.error) throw overdueResult.error
  if (completedResult.error) throw completedResult.error
  if (baselineCountResult.error && !(baselineCountResult.error.message.includes('relation') && baselineCountResult.error.message.includes('surveillance_enrolments'))) {
    throw baselineCountResult.error
  }
  if (reviewTaskCountResult.error && !(reviewTaskCountResult.error.message.includes('relation') && reviewTaskCountResult.error.message.includes('surveillance_review_tasks'))) {
    throw reviewTaskCountResult.error
  }
  if (availabilityCountResult.error && !(availabilityCountResult.error.message.includes('relation') && availabilityCountResult.error.message.includes('surveillance_worker_availability_exceptions'))) {
    throw availabilityCountResult.error
  }
  if (escalationCountResult.error && !(escalationCountResult.error.message.includes('relation') && escalationCountResult.error.message.includes('surveillance_notifications'))) {
    throw escalationCountResult.error
  }

  const baselineCount = new Set((baselineCountResult.data ?? []).map((row) => row.surveillance_worker_id)).size
  const reviewTaskCount = new Set((reviewTaskCountResult.data ?? []).map((row) => row.surveillance_worker_id)).size
  const availabilityCount = new Set((availabilityCountResult.data ?? []).map((row) => row.surveillance_worker_id)).size
  const baselineWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'baseline')).slice(0, 5)
  const dueSoonWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'due-soon')).slice(0, 5)
  const reviewTaskWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'review-tasks')).slice(0, 5)
  const availabilityWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'availability')).slice(0, 5)
  const overdueWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'overdue')).slice(0, 5)
  const referenceDate = new Date()
  const overdueOnSiteWorkers = allWorkers
    .filter((worker) => matchesQueueKind(worker, 'overdue') && getWorkerRosterStatus(worker, referenceDate) === 'on_site')
    .slice(0, 5)
  const dueSoonOnSiteWorkers = allWorkers
    .filter((worker) => matchesQueueKind(worker, 'due-soon') && getWorkerRosterStatus(worker, referenceDate) === 'on_site')
    .slice(0, 5)
  const missingRosterWorkers = allWorkers
    .filter((worker) => getWorkerRosterStatus(worker, referenceDate) === 'missing_roster')
    .slice(0, 5)
  const workerLookup = allWorkers.map((worker) => ({
    id: worker.id,
    displayName: worker.display_name,
    role: worker.selectedRole?.name ?? worker.job_role_name,
    siteName: worker.site_name,
    complianceStatus: worker.complianceStatus,
    nextDueAt: worker.nextDueAt,
    rosterLabel: getWorkerRosterAvailabilityLabel(worker, referenceDate),
  }))

  return {
    context,
    metrics,
    complianceSummary,
    openEscalationCount: escalationCountResult.error ? 0 : (escalationCountResult.count ?? 0),
    queueSummary: {
      all: complianceSummary.total,
      overdue: complianceSummary.red,
      baseline: baselineCount,
      dueSoon: complianceSummary.amber,
      reviewTasks: reviewTaskCount,
      availability: availabilityCount,
    },
    workerLookup,
    actionWorkers: {
      overdueOnSite: overdueOnSiteWorkers,
      dueSoonOnSite: dueSoonOnSiteWorkers,
      reviewTasks: reviewTaskWorkers,
      availability: availabilityWorkers,
      missingRoster: missingRosterWorkers,
    },
    todayAppointments: attachRequirementToAppointments(
      (todayAppointmentsResult.data ?? []) as SurveillanceAppointment[],
      programMap,
      surveillanceTypeMap,
    ),
    upcomingAppointments: attachRequirementToAppointments(
      (upcomingResult.data ?? []) as SurveillanceAppointment[],
      programMap,
      surveillanceTypeMap,
    ),
    dueSoonEnrolments: attachRequirementToEnrolments(
      (dueSoonResult.data ?? []) as SurveillanceEnrolment[],
      programMap,
      surveillanceTypeMap,
    ),
    overdueEnrolments: attachRequirementToEnrolments(
      (overdueResult.data ?? []) as SurveillanceEnrolment[],
      programMap,
      surveillanceTypeMap,
    ),
    completedThisWeek: attachRequirementToAppointments(
      (completedResult.data ?? []) as SurveillanceAppointment[],
      programMap,
      surveillanceTypeMap,
    ),
    priorityWorkers: {
      overdue: overdueWorkers,
      baseline: baselineWorkers,
      'due-soon': dueSoonWorkers,
      'review-tasks': reviewTaskWorkers,
      availability: availabilityWorkers,
    },
  }
}

export async function listSurveillanceEligibleWorkers(
  search?: string,
  complianceStatus?: SurveillanceComplianceStatus,
): Promise<{
  context: SurveillanceContext
  complianceSummary: SurveillanceComplianceSummary
  workers: SurveillanceEligibleWorker[]
  availableSurveillanceTypes: SurveillanceType[]
  availableRoles: Pick<BusinessWorkerRole, 'id' | 'name'>[]
  availableSites: Array<{ id: string; name: string }>
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [programMap, surveillanceTypeMap, complianceSummary] = await Promise.all([
    getProgramMap(supabase, context.account.business_id),
    getSurveillanceTypeMap(supabase, context.account.business_id),
    getComplianceSummary(supabase, context.account.business_id),
  ])
  const [roleMap, sitesResult, surveillanceTypesResult] = await Promise.all([
    getRoleMap(supabase, context.account.business_id),
    supabase
      .from('sites')
      .select('id, name')
      .eq('business_id', context.account.business_id)
      .order('name', { ascending: true }),
    supabase
      .from('surveillance_types')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ])

  if (sitesResult.error) throw sitesResult.error

  return {
    context,
    complianceSummary,
    workers: await loadEligibleWorkers(
      supabase,
      context.account.business_id,
      programMap,
      surveillanceTypeMap,
      search,
      complianceStatus,
      100,
    ),
    availableSurveillanceTypes: surveillanceTypesResult.error ? [] : ((surveillanceTypesResult.data ?? []) as SurveillanceType[]),
    availableRoles: Array.from(roleMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    availableSites: (sitesResult.data ?? []) as Array<{ id: string; name: string }>,
  }
}

export async function listSurveillanceWorkerQueue(
  queueKind: SurveillanceQueueKind,
  search?: string,
): Promise<{
  context: SurveillanceContext
  queueSummary: SurveillanceQueueSummary
  workers: SurveillanceEligibleWorker[]
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const businessId = context.account.business_id
  const [programMap, surveillanceTypeMap] = await Promise.all([
    getProgramMap(supabase, businessId),
    getSurveillanceTypeMap(supabase, businessId),
  ])

  const allWorkers = await loadEligibleWorkers(supabase, businessId, programMap, surveillanceTypeMap, search, undefined, 500)
  const overdueWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'overdue'))
  const baselineWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'baseline'))
  const dueSoonWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'due-soon'))
  const reviewTaskWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'review-tasks'))
  const availabilityWorkers = allWorkers.filter((worker) => matchesQueueKind(worker, 'availability'))

  return {
    context,
    queueSummary: {
      all: allWorkers.length,
      overdue: overdueWorkers.length,
      baseline: baselineWorkers.length,
      dueSoon: dueSoonWorkers.length,
      reviewTasks: reviewTaskWorkers.length,
      availability: availabilityWorkers.length,
    },
    workers: queueKind === 'all'
      ? allWorkers
      : queueKind === 'overdue'
        ? overdueWorkers
        : queueKind === 'baseline'
          ? baselineWorkers
          : queueKind === 'due-soon'
            ? dueSoonWorkers
            : queueKind === 'review-tasks'
              ? reviewTaskWorkers
              : availabilityWorkers,
  }
}

export async function listSurveillanceAppointments(): Promise<{
  context: SurveillanceContext
  appointments: SurveillanceAppointmentWithRequirement[]
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled) return null

  const supabase = await createClient()
  const [programMap, surveillanceTypeMap, appointmentsResult] = await Promise.all([
    getProgramMap(supabase, context.account.business_id),
    getSurveillanceTypeMap(supabase, context.account.business_id),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('scheduled_at', { ascending: true })
      .limit(100),
  ])

  if (appointmentsResult.error) throw appointmentsResult.error

  return {
    context,
    appointments: attachRequirementToAppointments(
      (appointmentsResult.data ?? []) as SurveillanceAppointment[],
      programMap,
      surveillanceTypeMap,
    ),
  }
}

export async function getSurveillanceWorkerDetail(workerId: string): Promise<SurveillanceWorkerDetail | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [programMap, surveillanceTypeMap] = await Promise.all([
    getProgramMap(supabase, context.account.business_id),
    getSurveillanceTypeMap(supabase, context.account.business_id),
  ])

  const [operationalWorkers, programsResult, surveillanceTypesResult, providers, providerLocations, reasonCodes, rostersResult, availabilityResult, reviewTasksResult, enrolmentsResult, appointmentsResult, outcomesResult] = await Promise.all([
    loadEligibleWorkers(supabase, context.account.business_id, programMap, surveillanceTypeMap, undefined, undefined, 500),
    supabase
      .from('surveillance_programs')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('surveillance_types')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    listSurveillanceProviders(supabase, context.account.business_id),
    listSurveillanceProviderLocations(supabase, context.account.business_id),
    listSurveillanceReasonCodes(supabase, context.account.business_id),
    supabase
      .from('surveillance_worker_rosters')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('surveillance_worker_id', workerId)
      .order('updated_at', { ascending: false })
      .limit(1),
    supabase
      .from('surveillance_worker_availability_exceptions')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('surveillance_worker_id', workerId)
      .order('starts_at', { ascending: false })
      .limit(20),
    supabase
      .from('surveillance_review_tasks')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('surveillance_worker_id', workerId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('surveillance_enrolments')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('surveillance_worker_id', workerId)
      .order('created_at', { ascending: false }),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('surveillance_worker_id', workerId)
      .order('scheduled_at', { ascending: false })
      .limit(25),
    supabase
      .from('surveillance_outcomes_minimal')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('surveillance_worker_id', workerId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (programsResult.error) throw programsResult.error
  const surveillanceTypes = surveillanceTypesResult.error ? [] : ((surveillanceTypesResult.data ?? []) as SurveillanceType[])
  const roster = rostersResult.error ? null : (((rostersResult.data ?? []) as SurveillanceWorkerRoster[])[0] ?? null)
  const availabilityExceptions = availabilityResult.error
    ? []
    : ((availabilityResult.data ?? []) as SurveillanceWorkerAvailabilityException[])
  const reviewTasks = reviewTasksResult.error ? [] : ((reviewTasksResult.data ?? []) as SurveillanceReviewTask[])
  if (enrolmentsResult.error) throw enrolmentsResult.error
  if (appointmentsResult.error) throw appointmentsResult.error
  if (outcomesResult.error) throw outcomesResult.error

  const enrolments = attachRequirementToEnrolments(
    (enrolmentsResult.data ?? []) as SurveillanceEnrolment[],
    programMap,
    surveillanceTypeMap,
  )
  const appointments = attachRequirementToAppointments(
    (appointmentsResult.data ?? []) as SurveillanceAppointment[],
    programMap,
    surveillanceTypeMap,
  )
  const worker = operationalWorkers.find((entry) => entry.id === workerId) ?? null
  const workerDisplayName = worker?.display_name ?? enrolments[0]?.worker_display_name ?? appointments[0]?.worker_display_name ?? 'Worker'

  return {
    context,
    workerId,
    workerDisplayName,
    worker,
    availablePrograms: (programsResult.data ?? []) as SurveillanceProgram[],
    availableSurveillanceTypes: surveillanceTypes,
    availableProviders: providers,
    availableProviderLocations: providerLocations,
    availableReasonCodes: reasonCodes,
    roster,
    availabilityExceptions,
    reviewTasks,
    enrolments,
    appointments,
    outcomes: (outcomesResult.data ?? []) as SurveillanceOutcomeMinimal[],
  }
}

export async function getSurveillanceAppointmentDetail(appointmentId: string): Promise<SurveillanceAppointmentDetail | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled) return null

  const supabase = await createClient()

  const [programMap, surveillanceTypeMap, providers, providerLocations, reasonCodes, appointmentResult] = await Promise.all([
    getProgramMap(supabase, context.account.business_id),
    getSurveillanceTypeMap(supabase, context.account.business_id),
    listSurveillanceProviders(supabase, context.account.business_id),
    listSurveillanceProviderLocations(supabase, context.account.business_id),
    listSurveillanceReasonCodes(supabase, context.account.business_id),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('id', appointmentId)
      .single(),
  ])

  if (appointmentResult.error) {
    if (appointmentResult.error.code === 'PGRST116') return null
    throw appointmentResult.error
  }

  const appointment = appointmentResult.data as SurveillanceAppointment

  const [enrolmentResult, outcomeResult] = await Promise.all([
    supabase
      .from('surveillance_enrolments')
      .select('*')
      .eq('id', appointment.enrolment_id)
      .maybeSingle(),
    supabase
      .from('surveillance_outcomes_minimal')
      .select('*')
      .eq('appointment_id', appointmentId)
      .maybeSingle(),
  ])

  if (enrolmentResult.error) throw enrolmentResult.error
  if (outcomeResult.error) throw outcomeResult.error

  return {
    context,
    appointment: attachRequirementToAppointments([appointment], programMap, surveillanceTypeMap)[0],
    enrolment: enrolmentResult.data
      ? attachRequirementToEnrolments([enrolmentResult.data as SurveillanceEnrolment], programMap, surveillanceTypeMap)[0]
      : null,
    outcome: (outcomeResult.data ?? null) as SurveillanceOutcomeMinimal | null,
    availableProviders: providers,
    availableProviderLocations: providerLocations,
    availableReasonCodes: reasonCodes,
  }
}

export async function listSurveillancePrograms(): Promise<{
  context: SurveillanceContext
  programs: SurveillanceProgram[]
  surveillanceTypes: SurveillanceType[]
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [programsResult, surveillanceTypesResult] = await Promise.all([
    supabase
      .from('surveillance_programs')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('name', { ascending: true }),
    supabase
      .from('surveillance_types')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('name', { ascending: true }),
  ])

  if (programsResult.error) throw programsResult.error

  return {
    context,
    programs: (programsResult.data ?? []) as SurveillanceProgram[],
    surveillanceTypes: surveillanceTypesResult.error ? [] : ((surveillanceTypesResult.data ?? []) as SurveillanceType[]),
  }
}

export async function listSurveillanceNotifications(): Promise<{
  context: SurveillanceContext
  notifications: SurveillanceNotificationWithRecipients[]
  escalationPolicy: SurveillanceEscalationPolicy
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [notificationsResult, recipientsResult, workersResult, policyResult] = await Promise.all([
    supabase
      .from('surveillance_notifications')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('scheduled_for', { ascending: false })
      .limit(1000),
    supabase
      .from('surveillance_notification_recipients')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('created_at', { ascending: false })
      .limit(3000),
    supabase
      .from('surveillance_workers')
      .select('id, display_name')
      .eq('business_id', context.account.business_id),
    supabase
      .from('surveillance_escalation_policies')
      .select('*')
      .eq('business_id', context.account.business_id)
      .maybeSingle(),
  ])

  if (notificationsResult.error) {
    if (notificationsResult.error.message.includes('relation') && notificationsResult.error.message.includes('surveillance_notifications')) {
      return {
        context,
        notifications: [],
        escalationPolicy: {
          business_id: context.account.business_id,
          created_at: '',
          updated_by: null,
          updated_at: '',
          ...DEFAULT_SURVEILLANCE_ESCALATION_POLICY,
        },
      }
    }
    throw notificationsResult.error
  }

  if (recipientsResult.error) {
    if (!(recipientsResult.error.message.includes('relation') && recipientsResult.error.message.includes('surveillance_notification_recipients'))) {
      throw recipientsResult.error
    }
  }

  if (workersResult.error) throw workersResult.error
  if (policyResult.error && !(policyResult.error.message.includes('relation') && policyResult.error.message.includes('surveillance_escalation_policies'))) {
    throw policyResult.error
  }

  const workerNameMap = new Map(
    ((workersResult.data ?? []) as Array<Pick<SurveillanceWorker, 'id' | 'display_name'>>).map((worker) => [worker.id, worker.display_name]),
  )

  const recipients = (recipientsResult.data ?? []) as SurveillanceNotificationRecipient[]
  const notifications = (notificationsResult.data ?? []) as SurveillanceNotification[]
  const escalationPolicy = (policyResult.data ?? {
    business_id: context.account.business_id,
    created_at: '',
    updated_by: null,
    updated_at: '',
    ...DEFAULT_SURVEILLANCE_ESCALATION_POLICY,
  }) as SurveillanceEscalationPolicy

  return {
    context,
    escalationPolicy,
    notifications: notifications.map((notification) => ({
      ...notification,
      recipients: recipients.filter((recipient) => recipient.notification_id === notification.id),
      workerDisplayName: workerNameMap.get(notification.surveillance_worker_id) ?? null,
    })),
  }
}

export async function listSurveillanceEscalations(): Promise<{
  context: SurveillanceContext
  escalations: SurveillanceEscalationQueueItem[]
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [notificationsResult, recipientsResult, workersResult] = await Promise.all([
    supabase
      .from('surveillance_notifications')
      .select('*')
      .eq('business_id', context.account.business_id)
      .in('notification_type', [...SURVEILLANCE_ESCALATION_TYPES])
      .in('delivery_status', ['pending', 'sent'])
      .order('scheduled_for', { ascending: false })
      .limit(100),
    supabase
      .from('surveillance_notification_recipients')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('surveillance_workers')
      .select('id, display_name')
      .eq('business_id', context.account.business_id),
  ])

  if (notificationsResult.error) {
    if (notificationsResult.error.message.includes('relation') && notificationsResult.error.message.includes('surveillance_notifications')) {
      return { context, escalations: [] }
    }
    throw notificationsResult.error
  }

  if (recipientsResult.error) {
    if (!(recipientsResult.error.message.includes('relation') && recipientsResult.error.message.includes('surveillance_notification_recipients'))) {
      throw recipientsResult.error
    }
  }
  if (workersResult.error) throw workersResult.error

  const workerNameMap = new Map(
    ((workersResult.data ?? []) as Array<Pick<SurveillanceWorker, 'id' | 'display_name'>>).map((worker) => [worker.id, worker.display_name]),
  )
  const recipients = (recipientsResult.data ?? []) as SurveillanceNotificationRecipient[]
  const now = Date.now()

  return {
    context,
    escalations: ((notificationsResult.data ?? []) as SurveillanceNotification[]).map((notification) => ({
      ...notification,
      recipients: recipients.filter((recipient) => recipient.notification_id === notification.id),
      workerDisplayName: workerNameMap.get(notification.surveillance_worker_id) ?? null,
      daysOpen: Math.max(0, Math.floor((now - new Date(notification.created_at).getTime()) / (24 * 60 * 60 * 1000))),
    })),
  }
}

export async function listSurveillanceProvidersPage(): Promise<{
  context: SurveillanceContext
  providers: SurveillanceProvider[]
  providerLocations: SurveillanceProviderLocation[]
  availableSites: Array<{ id: string; name: string }>
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [providersResult, providerLocationsResult, sitesResult] = await Promise.all([
    supabase
      .from('surveillance_providers')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('name', { ascending: true }),
    supabase
      .from('surveillance_provider_locations')
      .select('*')
      .eq('business_id', context.account.business_id)
      .order('location_name', { ascending: true }),
    supabase
      .from('sites')
      .select('id, name')
      .eq('business_id', context.account.business_id)
      .order('name', { ascending: true }),
  ])

  if (providersResult.error) throw providersResult.error
  if (providerLocationsResult.error) throw providerLocationsResult.error
  if (sitesResult.error) throw sitesResult.error

  return {
    context,
    providers: (providersResult.data ?? []) as SurveillanceProvider[],
    providerLocations: (providerLocationsResult.data ?? []) as SurveillanceProviderLocation[],
    availableSites: (sitesResult.data ?? []) as Array<{ id: string; name: string }>,
  }
}

export async function getSurveillanceProviderDetail(providerId: string): Promise<SurveillanceProviderDetail | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const [providerResult, providerLocationsResult, sitesResult] = await Promise.all([
    supabase
      .from('surveillance_providers')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('id', providerId)
      .maybeSingle(),
    supabase
      .from('surveillance_provider_locations')
      .select('*')
      .eq('business_id', context.account.business_id)
      .eq('provider_id', providerId)
      .order('location_name', { ascending: true }),
    supabase
      .from('sites')
      .select('id, name')
      .eq('business_id', context.account.business_id)
      .order('name', { ascending: true }),
  ])

  if (providerResult.error) throw providerResult.error
  if (providerLocationsResult.error) throw providerLocationsResult.error
  if (sitesResult.error) throw sitesResult.error
  if (!providerResult.data) return null

  return {
    context,
    provider: providerResult.data as SurveillanceProvider,
    providerLocations: (providerLocationsResult.data ?? []) as SurveillanceProviderLocation[],
    availableSites: (sitesResult.data ?? []) as Array<{ id: string; name: string }>,
  }
}

export async function getSurveillanceReportsSummary(): Promise<{
  context: SurveillanceContext
  metrics: SurveillanceDashboardMetrics
  complianceSummary: SurveillanceComplianceSummary
  workerCount: number
  manualWorkerCount: number
  appWorkerCount: number
  openReviewTaskCount: number
  workersWithAvailabilityConflicts: number
  siteBreakdown: SurveillanceSiteReportRow[]
  requirementBreakdown: SurveillanceRequirementReportRow[]
  providerBreakdown: SurveillanceProviderReportRow[]
} | null> {
  const context = await getAuthenticatedSurveillanceContext()
  if (!context || !context.moduleEnabled || !canManageSurveillance(context.account)) return null

  const supabase = await createClient()
  const businessId = context.account.business_id
  const [metrics, complianceSummary, programMap, surveillanceTypeMap] = await Promise.all([
    getMetrics(supabase, businessId),
    getComplianceSummary(supabase, businessId),
    getProgramMap(supabase, businessId),
    getSurveillanceTypeMap(supabase, businessId),
  ])

  const [
    workers,
    enrolmentsResult,
    appointmentsResult,
    reviewTasksResult,
    availabilityResult,
    providers,
    providerLocations,
  ] = await Promise.all([
    loadEligibleWorkers(supabase, businessId, programMap, surveillanceTypeMap, undefined, undefined, 5000),
    supabase
      .from('surveillance_enrolments')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'active'),
    supabase
      .from('surveillance_appointments')
      .select('*')
      .eq('business_id', businessId)
      .order('scheduled_at', { ascending: false })
      .limit(1000),
    supabase
      .from('surveillance_review_tasks')
      .select('id, status')
      .eq('business_id', businessId)
      .in('status', ['open', 'in_progress']),
    supabase
      .from('surveillance_worker_availability_exceptions')
      .select('id')
      .eq('business_id', businessId)
      .lte('starts_at', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString())
      .gte('ends_at', new Date().toISOString()),
    listSurveillanceProviders(supabase, businessId),
    listSurveillanceProviderLocations(supabase, businessId),
  ])

  if (enrolmentsResult.error) throw enrolmentsResult.error
  if (appointmentsResult.error) throw appointmentsResult.error
  if (reviewTasksResult.error && !(reviewTasksResult.error.message.includes('relation') && reviewTasksResult.error.message.includes('surveillance_review_tasks'))) {
    throw reviewTasksResult.error
  }
  if (availabilityResult.error && !(availabilityResult.error.message.includes('relation') && availabilityResult.error.message.includes('surveillance_worker_availability_exceptions'))) {
    throw availabilityResult.error
  }

  const siteBreakdownMap = new Map<string, SurveillanceSiteReportRow>()
  for (const worker of workers) {
    const key = worker.site_id ?? '__unassigned__'
    const row = siteBreakdownMap.get(key) ?? {
      siteId: worker.site_id,
      siteName: worker.site_name ?? 'Unassigned site',
      workerCount: 0,
      green: 0,
      amber: 0,
      red: 0,
      grey: 0,
    }
    row.workerCount += 1
    row[worker.complianceStatus] += 1
    siteBreakdownMap.set(key, row)
  }

  const now = Date.now()
  const requirementBreakdownMap = new Map<string, SurveillanceRequirementReportRow>()
  const activeEnrolments = (enrolmentsResult.data ?? []) as SurveillanceEnrolment[]
  for (const enrolment of activeEnrolments) {
    const requirement = getRequirementSummary(
      programMap.get(enrolment.program_id) ?? null,
      enrolment.surveillance_type_id ? surveillanceTypeMap.get(enrolment.surveillance_type_id) ?? null : null,
    )
    const key = requirement?.id ?? enrolment.program_id
    const row = requirementBreakdownMap.get(key) ?? {
      requirementId: key,
      requirementName: requirement?.name ?? 'Unmapped requirement',
      activeEnrolments: 0,
      baselineIncomplete: 0,
      dueSoon: 0,
      overdue: 0,
      noDueDate: 0,
    }

    row.activeEnrolments += 1
    if (enrolment.baseline_required && !enrolment.baseline_completed_at) {
      row.baselineIncomplete += 1
    }

    const dueAt = toTimestamp(enrolment.next_due_at)
    if (dueAt === null) {
      row.noDueDate += 1
    } else if (dueAt < now) {
      row.overdue += 1
    } else if (isDueSoonTimestamp(dueAt, now)) {
      row.dueSoon += 1
    }

    requirementBreakdownMap.set(key, row)
  }

  const providerMap = new Map(providers.map((provider) => [provider.id, provider]))
  const providerLocationMap = new Map(providerLocations.map((location) => [location.id, location]))
  const providerBreakdownMap = new Map<string, SurveillanceProviderReportRow>()
  for (const appointment of (appointmentsResult.data ?? []) as SurveillanceAppointment[]) {
    const location = appointment.provider_location_id ? providerLocationMap.get(appointment.provider_location_id) ?? null : null
    const provider = appointment.provider_id
      ? providerMap.get(appointment.provider_id) ?? null
      : location?.provider_id
        ? providerMap.get(location.provider_id) ?? null
        : null
    const key = `${appointment.provider_id ?? location?.provider_id ?? 'unassigned'}:${appointment.provider_location_id ?? 'unassigned'}`
    const row = providerBreakdownMap.get(key) ?? {
      providerId: appointment.provider_id ?? location?.provider_id ?? null,
      providerName: provider?.name ?? 'Unassigned provider',
      providerLocationId: appointment.provider_location_id ?? null,
      providerLocationName: location?.location_name ?? 'No clinic location',
      scheduled: 0,
      completed: 0,
      didNotAttend: 0,
      cancelled: 0,
    }

    if (appointment.status === 'completed') row.completed += 1
    else if (appointment.status === 'did_not_attend') row.didNotAttend += 1
    else if (appointment.status === 'cancelled') row.cancelled += 1
    else row.scheduled += 1

    providerBreakdownMap.set(key, row)
  }

  return {
    context,
    metrics,
    complianceSummary,
    workerCount: workers.length,
    manualWorkerCount: workers.filter((worker) => worker.worker_source === 'manual_entry').length,
    appWorkerCount: workers.filter((worker) => worker.worker_source === 'app_user').length,
    openReviewTaskCount: (reviewTasksResult.data ?? []).length,
    workersWithAvailabilityConflicts: (availabilityResult.data ?? []).length,
    siteBreakdown: [...siteBreakdownMap.values()].sort((a, b) => a.siteName.localeCompare(b.siteName)),
    requirementBreakdown: [...requirementBreakdownMap.values()].sort((a, b) => b.activeEnrolments - a.activeEnrolments),
    providerBreakdown: [...providerBreakdownMap.values()].sort((a, b) => (
      a.providerName.localeCompare(b.providerName) || a.providerLocationName.localeCompare(b.providerLocationName)
    )),
  }
}
