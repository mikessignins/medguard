import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBusinessEmailSettingsForAdmin } from '@/lib/business-email-settings'
import {
  saveBusinessEmailSettingsAction,
  sendBusinessEmailTestAction,
} from '@/lib/business-email-settings-actions'

export default async function AdminEmailDeliveryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: account } = await supabase
    .from('user_accounts')
    .select('id, role, business_id')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'admin') redirect('/')

  const settings = await getBusinessEmailSettingsForAdmin(account.business_id)
  const deliveryMode = settings?.delivery_mode ?? 'in_app'
  const smtpSecurity = settings?.smtp_security ?? 'starttls'

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-400">Business settings</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--text-1)]">Email delivery</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-3)]">
          Configure business-owned SMTP delivery for administrative reminders. MedGuard stores the settings for this business only and uses them for notification emails such as occupational health reminders.
        </p>
      </div>

      {!settings ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-[var(--text-2)]">
          Email settings are not configured yet. If saving fails, apply the latest database migration first.
        </div>
      ) : null}

      <form action={saveBusinessEmailSettingsAction} className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <input type="hidden" name="businessId" value={account.business_id} />
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="deliveryMode" className="block text-sm font-medium text-[var(--text-2)]">Delivery mode</label>
            <select id="deliveryMode" name="deliveryMode" defaultValue={deliveryMode} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
              <option value="in_app">In-app only</option>
              <option value="smtp">Business SMTP</option>
            </select>
            <p className="text-xs text-[var(--text-3)]">In-app only keeps reminders inside MedGuard. Business SMTP sends email using the business mailbox.</p>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-2)]">
            <input name="isEnabled" type="checkbox" value="true" defaultChecked={Boolean(settings?.is_enabled)} className="h-4 w-4 rounded border-[var(--border)]" />
            Enable external email delivery
          </label>

          <div className="space-y-2">
            <label htmlFor="fromName" className="block text-sm font-medium text-[var(--text-2)]">From name</label>
            <input id="fromName" name="fromName" defaultValue={settings?.from_name ?? ''} placeholder="Mineral Resources Occ Health" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          </div>

          <div className="space-y-2">
            <label htmlFor="fromEmail" className="block text-sm font-medium text-[var(--text-2)]">From email</label>
            <input id="fromEmail" name="fromEmail" type="email" defaultValue={settings?.from_email ?? ''} placeholder="occ-health@example.com" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          </div>

          <div className="space-y-2">
            <label htmlFor="replyToEmail" className="block text-sm font-medium text-[var(--text-2)]">Reply-to email</label>
            <input id="replyToEmail" name="replyToEmail" type="email" defaultValue={settings?.reply_to_email ?? ''} placeholder="occ-health@example.com" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          </div>

          <div className="space-y-2">
            <label htmlFor="smtpHost" className="block text-sm font-medium text-[var(--text-2)]">SMTP host</label>
            <input id="smtpHost" name="smtpHost" defaultValue={settings?.smtp_host ?? ''} placeholder="smtp.office365.com" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          </div>

          <div className="space-y-2">
            <label htmlFor="smtpPort" className="block text-sm font-medium text-[var(--text-2)]">SMTP port</label>
            <input id="smtpPort" name="smtpPort" type="number" min="1" max="65535" defaultValue={settings?.smtp_port ?? 587} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          </div>

          <div className="space-y-2">
            <label htmlFor="smtpSecurity" className="block text-sm font-medium text-[var(--text-2)]">Security</label>
            <select id="smtpSecurity" name="smtpSecurity" defaultValue={smtpSecurity} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]">
              <option value="starttls">STARTTLS</option>
              <option value="tls">TLS</option>
              <option value="none">None</option>
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="smtpUsername" className="block text-sm font-medium text-[var(--text-2)]">SMTP username</label>
            <input id="smtpUsername" name="smtpUsername" defaultValue={settings?.smtp_username ?? ''} placeholder="occ-health@example.com" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          </div>

          <div className="space-y-2">
            <label htmlFor="smtpPassword" className="block text-sm font-medium text-[var(--text-2)]">SMTP password or app password</label>
            <input id="smtpPassword" name="smtpPassword" type="password" placeholder={settings?.has_smtp_password ? 'Saved - leave blank to keep current password' : 'Enter password'} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
            <p className="text-xs text-[var(--text-3)]">Passwords are encrypted before storage and are never shown again.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">
            Save email settings
          </button>
          {settings?.last_test_status ? (
            <p className="text-sm text-[var(--text-3)]">
              Last test: {settings.last_test_status}
              {settings.last_tested_at ? ` at ${new Date(settings.last_tested_at).toLocaleString('en-AU')}` : ''}
            </p>
          ) : null}
        </div>
        {settings?.last_test_error ? (
          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{settings.last_test_error}</p>
        ) : null}
      </form>

      <form action={sendBusinessEmailTestAction} className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <input type="hidden" name="businessId" value={account.business_id} />
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-1)]">Send a test email</h2>
          <p className="mt-1 text-sm text-[var(--text-3)]">Save the SMTP settings first, then send a test to confirm the business mailbox works.</p>
        </div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <input name="testRecipient" type="email" required placeholder="recipient@example.com" className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-1)]" />
          <button type="submit" className="shrink-0 rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-1)] transition hover:bg-[var(--bg-surface)]">
            Send test
          </button>
        </div>
      </form>
    </div>
  )
}
