'use client'

import { useMemo, useState } from 'react'
import StatusBadge from '@/components/surveillance/StatusBadge'
import { formatTimestamp } from '@/lib/date-format'
import type { SurveillanceNotificationWithRecipients } from '@/lib/surveillance/queries'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

function formatNotificationType(value: string) {
  switch (value) {
    case 'due_30_day':
      return 'Due soon'
    case 'overdue_worker':
      return 'Worker overdue'
    case 'day_of':
      return 'Appointment today'
    case 'escalation_occ_health':
      return 'Occ health escalation'
    case 'escalation_supervisor':
      return 'Supervisor escalation'
    case 'escalation_manager':
      return 'Manager escalation'
    default:
      return value.replaceAll('_', ' ')
  }
}

function notificationStatusBadge(status: SurveillanceNotificationWithRecipients['delivery_status']) {
  if (status === 'acknowledged') return 'confirmed'
  if (status === 'failed') return 'did_not_attend'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'sent') return 'completed'
  return 'scheduled'
}

function formatRecipients(notification: SurveillanceNotificationWithRecipients) {
  if (notification.recipients.length === 0) return 'No recipients logged'
  return notification.recipients
    .map((recipient) => recipient.target_role ?? recipient.delivery_address ?? 'Recipient')
    .join(', ')
}

export default function NotificationLogTable({
  notifications,
}: {
  notifications: SurveillanceNotificationWithRecipients[]
}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(1)

  const typeOptions = useMemo(() => {
    return Array.from(new Set(notifications.map((notification) => notification.notification_type)))
      .sort((a, b) => formatNotificationType(a).localeCompare(formatNotificationType(b)))
  }, [notifications])

  const filteredNotifications = useMemo(() => {
    const normalisedQuery = query.trim().toLowerCase()

    return notifications.filter((notification) => {
      const typeLabel = formatNotificationType(notification.notification_type)
      const recipients = formatRecipients(notification)
      const searchable = [
        typeLabel,
        notification.workerDisplayName ?? 'Worker',
        notification.delivery_channel,
        notification.delivery_status,
        recipients,
      ].join(' ').toLowerCase()

      return (typeFilter === 'all' || notification.notification_type === typeFilter)
        && (statusFilter === 'all' || notification.delivery_status === statusFilter)
        && (!normalisedQuery || searchable.includes(normalisedQuery))
    })
  }, [notifications, query, statusFilter, typeFilter])

  const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const firstIndex = (currentPage - 1) * pageSize
  const visibleNotifications = filteredNotifications.slice(firstIndex, firstIndex + pageSize)
  const startCount = filteredNotifications.length === 0 ? 0 : firstIndex + 1
  const endCount = Math.min(firstIndex + pageSize, filteredNotifications.length)

  function resetToFirstPage() {
    setPage(1)
  }

  return (
    <section className="surv-card space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="surv-kicker">Delivery log</p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--surv-text)]">Notification history</h2>
          <p className="mt-1 text-sm text-[var(--surv-muted)]">
            Showing {startCount}-{endCount} of {filteredNotifications.length} matching entries.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px,190px,170px,150px]">
          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">Search</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                resetToFirstPage()
              }}
              placeholder="Worker, recipient, type"
              className="surv-input"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">Type</span>
            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value)
                resetToFirstPage()
              }}
              className="surv-input"
            >
              <option value="all">All types</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>{formatNotificationType(type)}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value)
                resetToFirstPage()
              }}
              className="surv-input"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--surv-muted)]">Show</span>
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                resetToFirstPage()
              }}
              className="surv-input"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size} rows</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {visibleNotifications.length === 0 ? (
        <div className="surv-empty">No notifications match the current filters.</div>
      ) : (
        <div className="surv-table overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--surv-border)] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Worker</th>
                <th className="px-4 py-3 font-medium">Scheduled</th>
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Recipients</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--surv-border)]">
              {visibleNotifications.map((notification) => (
                <tr key={notification.id}>
                  <td className="px-4 py-3 text-[var(--surv-muted)]">{formatNotificationType(notification.notification_type)}</td>
                  <td className="px-4 py-3">{notification.workerDisplayName ?? 'Worker'}</td>
                  <td className="px-4 py-3 text-[var(--surv-muted)]">{formatTimestamp(notification.scheduled_for)}</td>
                  <td className="px-4 py-3 text-[var(--surv-muted)]">{notification.delivery_channel}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={notificationStatusBadge(notification.delivery_status)} />
                  </td>
                  <td className="px-4 py-3 text-[var(--surv-muted)]">
                    {formatRecipients(notification)}
                    {notification.delivery_error ? (
                      <p className="mt-1 text-xs text-[var(--surv-red-text)]">{notification.delivery_error}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 text-sm text-[var(--surv-muted)] md:flex-row md:items-center md:justify-between">
        <p>
          Page {currentPage} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            className="surv-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={currentPage === totalPages}
            className="surv-btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}
