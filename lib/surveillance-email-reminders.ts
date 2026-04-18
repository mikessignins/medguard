import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import {
  getBusinessEmailSettingsForDelivery,
  getDecryptedSmtpPassword,
  type BusinessEmailSettings,
} from '@/lib/business-email-settings'
import { sendSmtpMail } from '@/lib/smtp-client'
import { safeLogServerEvent } from '@/lib/app-event-log'

type WorkerRow = {
  id: string
  business_id: string
  display_name: string
  email: string | null
}

type EnrolmentRow = {
  id: string
  business_id: string
  surveillance_worker_id: string
  worker_display_name: string
  next_due_at: string | null
}

type AppointmentRow = {
  id: string
  business_id: string
  surveillance_worker_id: string
  worker_display_name: string
  scheduled_at: string
  location: string | null
}

type NotificationRow = {
  id: string
  business_id: string
  surveillance_worker_id: string
  appointment_id: string | null
  enrolment_id: string | null
  notification_type: string
  scheduled_for: string
  attempt_count?: number | null
}

type RecipientRow = {
  id: string
  notification_id: string
  delivery_address: string | null
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Perth',
  }).format(new Date(value))
}

function notificationKey(type: string, id: string | null) {
  return `${type}:${id ?? ''}`
}

function subjectFor(notification: NotificationRow) {
  switch (notification.notification_type) {
    case 'overdue_worker':
      return 'Occupational health surveillance is overdue'
    case 'due_30_day':
      return 'Occupational health surveillance is due soon'
    case 'day_of':
      return 'Occupational health appointment today'
    default:
      return 'Occupational health reminder'
  }
}

function htmlFor(notification: NotificationRow, workerName: string, detail?: string | null) {
  const intro = notification.notification_type === 'day_of'
    ? `This is a reminder that ${workerName} has an occupational health appointment today.`
    : notification.notification_type === 'overdue_worker'
      ? `${workerName} has an occupational health surveillance requirement that is overdue.`
      : `${workerName} has an occupational health surveillance requirement due soon.`

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <p>Hello,</p>
      <p>${intro}</p>
      ${detail ? `<p>${detail}</p>` : ''}
      <p>Please contact your occupational health team if you need to change this booking.</p>
      <p style="color: #475569;">Sent automatically by MedGuard.</p>
    </div>
  `
}

async function getEnabledBusinessIds() {
  const service = createServiceClient()
  const { data, error } = await service
    .from('business_email_settings')
    .select('business_id')
    .eq('delivery_mode', 'smtp')
    .eq('is_enabled', true)

  if (error) {
    if (error.message.includes('business_email_settings')) return []
    throw new Error(error.message)
  }

  return (data ?? []).map((row) => String(row.business_id))
}

export async function queueSurveillanceEmailReminders(now = new Date()) {
  const service = createServiceClient()
  const businessIds = await getEnabledBusinessIds()
  let queued = 0
  let skipped = 0

  for (const businessId of businessIds) {
    const dueSoonCutoff = addDays(now, 30).toISOString()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const tomorrowStart = addDays(todayStart, 1)

    const [workersResult, enrolmentsResult, appointmentsResult, existingResult] = await Promise.all([
      service
        .from('surveillance_workers')
        .select('id, business_id, display_name, email')
        .eq('business_id', businessId)
        .eq('is_active', true),
      service
        .from('surveillance_enrolments')
        .select('id, business_id, surveillance_worker_id, worker_display_name, next_due_at')
        .eq('business_id', businessId)
        .eq('status', 'active')
        .not('next_due_at', 'is', null)
        .lte('next_due_at', dueSoonCutoff),
      service
        .from('surveillance_appointments')
        .select('id, business_id, surveillance_worker_id, worker_display_name, scheduled_at, location')
        .eq('business_id', businessId)
        .in('status', ['scheduled', 'confirmed', 'rescheduled'])
        .gte('scheduled_at', todayStart.toISOString())
        .lt('scheduled_at', tomorrowStart.toISOString()),
      service
        .from('surveillance_notifications')
        .select('notification_type, enrolment_id, appointment_id, delivery_status')
        .eq('business_id', businessId)
        .eq('delivery_channel', 'email')
        .in('delivery_status', ['pending', 'sent', 'acknowledged']),
    ])

    if (workersResult.error) throw new Error(workersResult.error.message)
    if (enrolmentsResult.error) throw new Error(enrolmentsResult.error.message)
    if (appointmentsResult.error) throw new Error(appointmentsResult.error.message)
    if (existingResult.error) throw new Error(existingResult.error.message)

    const workerMap = new Map(((workersResult.data ?? []) as WorkerRow[]).map((worker) => [worker.id, worker]))
    const existing = new Set((existingResult.data ?? []).map((row) => (
      notificationKey(
        String(row.notification_type),
        row.appointment_id ? String(row.appointment_id) : row.enrolment_id ? String(row.enrolment_id) : null,
      )
    )))

    const notifications: Array<{
      business_id: string
      surveillance_worker_id: string
      enrolment_id?: string | null
      appointment_id?: string | null
      notification_type: string
      delivery_channel: string
      scheduled_for: string
      delivery_status: string
      template_version: string
    }> = []

    for (const enrolment of (enrolmentsResult.data ?? []) as EnrolmentRow[]) {
      const worker = workerMap.get(enrolment.surveillance_worker_id)
      if (!worker?.email) {
        skipped += 1
        continue
      }

      const type = new Date(enrolment.next_due_at ?? '').getTime() <= now.getTime() ? 'overdue_worker' : 'due_30_day'
      const key = notificationKey(type, enrolment.id)
      if (existing.has(key)) {
        skipped += 1
        continue
      }
      existing.add(key)

      notifications.push({
        business_id: businessId,
        surveillance_worker_id: enrolment.surveillance_worker_id,
        enrolment_id: enrolment.id,
        appointment_id: null,
        notification_type: type,
        delivery_channel: 'email',
        scheduled_for: now.toISOString(),
        delivery_status: 'pending',
        template_version: 'email-v1',
      })
    }

    for (const appointment of (appointmentsResult.data ?? []) as AppointmentRow[]) {
      const worker = workerMap.get(appointment.surveillance_worker_id)
      if (!worker?.email) {
        skipped += 1
        continue
      }

      const key = notificationKey('day_of', appointment.id)
      if (existing.has(key)) {
        skipped += 1
        continue
      }
      existing.add(key)

      notifications.push({
        business_id: businessId,
        surveillance_worker_id: appointment.surveillance_worker_id,
        enrolment_id: null,
        appointment_id: appointment.id,
        notification_type: 'day_of',
        delivery_channel: 'email',
        scheduled_for: now.toISOString(),
        delivery_status: 'pending',
        template_version: 'email-v1',
      })
    }

    if (notifications.length === 0) continue

    const { data: inserted, error: insertError } = await service
      .from('surveillance_notifications')
      .insert(notifications)
      .select('id, business_id, surveillance_worker_id, appointment_id, enrolment_id, notification_type')

    if (insertError) throw new Error(insertError.message)

    const insertedRows = (inserted ?? []) as NotificationRow[]
    const recipientRows = insertedRows.map((notification) => {
      const worker = workerMap.get(notification.surveillance_worker_id)
      return {
        notification_id: notification.id,
        business_id: businessId,
        target_user_id: null,
        target_role: 'worker',
        delivery_address: worker?.email ?? null,
      }
    }).filter((row) => row.delivery_address)

    if (recipientRows.length > 0) {
      const { error: recipientError } = await service
        .from('surveillance_notification_recipients')
        .insert(recipientRows)
      if (recipientError) throw new Error(recipientError.message)
    }

    queued += insertedRows.length
  }

  return { queued, skipped, businesses: businessIds.length }
}

async function sendNotification(settings: BusinessEmailSettings, notification: NotificationRow, recipient: RecipientRow, worker: WorkerRow | undefined, appointment: AppointmentRow | undefined, enrolment: EnrolmentRow | undefined) {
  if (!settings.smtp_host || !settings.smtp_port || !settings.from_email || !recipient.delivery_address) {
    throw new Error('Business SMTP settings are incomplete.')
  }

  const detail = appointment
    ? `Appointment time: <strong>${formatDateTime(appointment.scheduled_at)}</strong>${appointment.location ? ` at <strong>${appointment.location}</strong>` : ''}.`
    : enrolment?.next_due_at
      ? `Due date: <strong>${formatDateTime(enrolment.next_due_at)}</strong>.`
      : null

  await sendSmtpMail({
    host: settings.smtp_host,
    port: settings.smtp_port,
    security: settings.smtp_security,
    username: settings.smtp_username,
    password: getDecryptedSmtpPassword(settings),
    from: settings.from_email,
    fromName: settings.from_name,
    replyTo: settings.reply_to_email,
    to: [recipient.delivery_address],
    subject: subjectFor(notification),
    html: htmlFor(notification, worker?.display_name ?? appointment?.worker_display_name ?? enrolment?.worker_display_name ?? 'Worker', detail),
  })
}

export async function sendPendingSurveillanceEmailReminders(limit = 50) {
  const service = createServiceClient()
  const { data: pending, error } = await service
    .from('surveillance_notifications')
    .select('id, business_id, surveillance_worker_id, appointment_id, enrolment_id, notification_type, scheduled_for, attempt_count')
    .eq('delivery_channel', 'email')
    .eq('delivery_status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) {
    if (error.message.includes('surveillance_notifications')) return { sent: 0, failed: 0, pending: 0 }
    throw new Error(error.message)
  }

  const notifications = (pending ?? []) as NotificationRow[]
  let sent = 0
  let failed = 0

  for (const notification of notifications) {
    const settings = await getBusinessEmailSettingsForDelivery(notification.business_id)
    if (!settings || settings.delivery_mode !== 'smtp' || !settings.is_enabled) {
      failed += 1
      await service
        .from('surveillance_notifications')
        .update({
          delivery_status: 'failed',
          delivery_error: 'SMTP delivery is not enabled for this business.',
          attempt_count: (notification.attempt_count ?? 0) + 1,
          last_attempted_at: new Date().toISOString(),
        })
        .eq('id', notification.id)
      continue
    }

    const [recipientsResult, workersResult, appointmentResult, enrolmentResult] = await Promise.all([
      service
        .from('surveillance_notification_recipients')
        .select('id, notification_id, delivery_address')
        .eq('notification_id', notification.id),
      service
        .from('surveillance_workers')
        .select('id, business_id, display_name, email')
        .eq('id', notification.surveillance_worker_id)
        .maybeSingle(),
      notification.appointment_id
        ? service
            .from('surveillance_appointments')
            .select('id, business_id, surveillance_worker_id, worker_display_name, scheduled_at, location')
            .eq('id', notification.appointment_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      notification.enrolment_id
        ? service
            .from('surveillance_enrolments')
            .select('id, business_id, surveillance_worker_id, worker_display_name, next_due_at')
            .eq('id', notification.enrolment_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (recipientsResult.error) throw new Error(recipientsResult.error.message)
    if (workersResult.error) throw new Error(workersResult.error.message)
    if (appointmentResult.error) throw new Error(appointmentResult.error.message)
    if (enrolmentResult.error) throw new Error(enrolmentResult.error.message)

    const recipients = (recipientsResult.data ?? []) as RecipientRow[]
    try {
      for (const recipient of recipients) {
        await sendNotification(
          settings,
          notification,
          recipient,
          (workersResult.data ?? undefined) as WorkerRow | undefined,
          (appointmentResult.data ?? undefined) as AppointmentRow | undefined,
          (enrolmentResult.data ?? undefined) as EnrolmentRow | undefined,
        )
      }

      await service
        .from('surveillance_notifications')
        .update({
          delivery_status: 'sent',
          sent_at: new Date().toISOString(),
          delivery_error: null,
          attempt_count: (notification.attempt_count ?? 0) + 1,
          last_attempted_at: new Date().toISOString(),
        })
        .eq('id', notification.id)

      sent += 1
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'Unknown SMTP delivery failure'
      await service
        .from('surveillance_notifications')
        .update({
          delivery_status: 'failed',
          delivery_error: message.slice(0, 1000),
          attempt_count: (notification.attempt_count ?? 0) + 1,
          last_attempted_at: new Date().toISOString(),
        })
        .eq('id', notification.id)

      await safeLogServerEvent({
        source: 'web_api',
        action: 'surveillance_email_reminder_failed',
        result: 'failure',
        businessId: notification.business_id,
        moduleKey: 'health_surveillance',
        targetId: notification.id,
        errorMessage: message,
      })

      failed += 1
    }
  }

  return { sent, failed, pending: notifications.length }
}

export async function runSurveillanceEmailReminderCycle() {
  const queued = await queueSurveillanceEmailReminders()
  const sent = await sendPendingSurveillanceEmailReminders()
  return { ...queued, ...sent }
}
