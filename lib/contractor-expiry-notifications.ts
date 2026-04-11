import { createServiceClient } from '@/lib/supabase/service'

type ExpiringMedic = {
  id: string
  business_id: string
  display_name: string
  email: string
  contract_end_date: string
}

type AdminRecipient = {
  id: string
  business_id: string
  display_name: string
  email: string
}

type BusinessRecord = {
  id: string
  name: string
}

function startOfUtcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
}

function daysUntil(contractEndDate: string, now = new Date()) {
  const contractDate = new Date(contractEndDate)
  const diff = startOfUtcDay(contractDate) - startOfUtcDay(now)
  return Math.round(diff / 86_400_000)
}

async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY or RESEND_FROM_EMAIL is missing.')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Resend error: ${message}`)
  }
}

function emailHtml({
  adminName,
  medicName,
  medicEmail,
  businessName,
  contractEndDate,
  daysRemaining,
}: {
  adminName: string
  medicName: string
  medicEmail: string
  businessName: string
  contractEndDate: string
  daysRemaining: number
}) {
  const dayLabel = daysRemaining === 1 ? '1 day' : `${daysRemaining} days`

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
      <p>Hello ${adminName || 'Admin'},</p>
      <p>
        Contractor medic <strong>${medicName}</strong> (${medicEmail}) at
        <strong>${businessName}</strong> is due to expire in <strong>${dayLabel}</strong>.
      </p>
      <p>
        Contract end date: <strong>${contractEndDate}</strong>
      </p>
      <p>
        Please review whether access should be extended or allowed to expire.
      </p>
      <p style="color: #475569;">Sent automatically by MedM8.</p>
    </div>
  `
}

export async function sendContractorExpiryWarnings(now = new Date()) {
  const service = createServiceClient()

  const [{ data: medics, error: medicError }, { data: admins, error: adminError }, { data: businesses, error: businessError }] = await Promise.all([
    service
      .from('user_accounts')
      .select('id, business_id, display_name, email, contract_end_date')
      .eq('role', 'medic')
      .eq('is_inactive', false)
      .not('contract_end_date', 'is', null),
    service
      .from('user_accounts')
      .select('id, business_id, display_name, email')
      .eq('role', 'admin'),
    service
      .from('businesses')
      .select('id, name'),
  ])

  if (medicError) throw new Error(medicError.message)
  if (adminError) throw new Error(adminError.message)
  if (businessError) throw new Error(businessError.message)

  const targetMedics = ((medics ?? []) as ExpiringMedic[])
    .map((medic) => ({
      ...medic,
      daysRemaining: daysUntil(medic.contract_end_date, now),
    }))
    .filter((medic) => medic.daysRemaining === 7 || medic.daysRemaining === 1)

  if (targetMedics.length === 0) {
    return { sent: 0, skipped: 0, due: 0 }
  }

  const businessMap = new Map(((businesses ?? []) as BusinessRecord[]).map((business) => [business.id, business]))
  const adminMap = new Map<string, AdminRecipient[]>()
  for (const admin of (admins ?? []) as AdminRecipient[]) {
    const list = adminMap.get(admin.business_id) ?? []
    list.push(admin)
    adminMap.set(admin.business_id, list)
  }

  const targetIds: string[] = []
  for (const medic of targetMedics) {
    const recipients = adminMap.get(medic.business_id) ?? []
    for (const admin of recipients) {
      targetIds.push(`${medic.id}:${medic.daysRemaining}:${admin.id}`)
    }
  }

  const { data: existingLogs, error: logError } = await service
    .from('app_event_log')
    .select('target_id')
    .eq('action', 'contractor_expiry_warning_email')
    .in('target_id', targetIds)

  if (logError) throw new Error(logError.message)
  const alreadySent = new Set((existingLogs ?? []).map((row) => String(row.target_id ?? '')))

  let sent = 0
  let skipped = 0
  const auditRows: Array<Record<string, unknown>> = []

  for (const medic of targetMedics) {
    const recipients = adminMap.get(medic.business_id) ?? []
    const businessName = businessMap.get(medic.business_id)?.name ?? medic.business_id

    for (const admin of recipients) {
      const targetId = `${medic.id}:${medic.daysRemaining}:${admin.id}`
      if (alreadySent.has(targetId)) {
        skipped += 1
        continue
      }

      await sendEmail({
        to: admin.email,
        subject: `[MedM8] Contractor medic expiry in ${medic.daysRemaining} day${medic.daysRemaining === 1 ? '' : 's'}`,
        html: emailHtml({
          adminName: admin.display_name,
          medicName: medic.display_name,
          medicEmail: medic.email,
          businessName,
          contractEndDate: medic.contract_end_date,
          daysRemaining: medic.daysRemaining,
        }),
      })

      auditRows.push({
        source: 'web_cron',
        action: 'contractor_expiry_warning_email',
        result: 'success',
        actor_role: 'system',
        actor_name: 'contractor-expiry-cron',
        business_id: medic.business_id,
        target_id: targetId,
        context: {
          admin_user_id: admin.id,
          admin_email: admin.email,
          medic_user_id: medic.id,
          medic_email: medic.email,
          medic_name: medic.display_name,
          contract_end_date: medic.contract_end_date,
          days_remaining: medic.daysRemaining,
        },
      })
      sent += 1
    }
  }

  if (auditRows.length > 0) {
    const { error: insertError } = await service.from('app_event_log').insert(auditRows)
    if (insertError) throw new Error(insertError.message)
  }

  return {
    sent,
    skipped,
    due: targetMedics.length,
  }
}
