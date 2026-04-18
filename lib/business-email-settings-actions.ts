'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret } from '@/lib/encryption'
import { getBusinessEmailSettingsForDelivery, getDecryptedSmtpPassword } from '@/lib/business-email-settings'
import { sendSmtpMail } from '@/lib/smtp-client'
import { safeLogServerEvent } from '@/lib/app-event-log'

const emailSettingsSchema = z.object({
  businessId: z.string().min(1),
  deliveryMode: z.enum(['in_app', 'smtp']),
  fromName: z.string().trim().max(160).optional(),
  fromEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  replyToEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  smtpHost: z.string().trim().max(255).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSecurity: z.enum(['tls', 'starttls', 'none']),
  smtpUsername: z.string().trim().max(320).optional(),
  smtpPassword: z.string().max(500).optional(),
  isEnabled: z.string().optional(),
})

const testEmailSchema = z.object({
  businessId: z.string().min(1),
  testRecipient: z.string().trim().email().max(320),
})

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value : ''
}

async function requireAdminForBusiness(businessId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('You must be signed in.')

  const { data: account, error } = await supabase
    .from('user_accounts')
    .select('id, display_name, role, business_id')
    .eq('id', user.id)
    .single()

  if (error) throw error
  if (!account || account.role !== 'admin' || account.business_id !== businessId) {
    throw new Error('Only business admins can change email delivery settings.')
  }

  return { supabase, account }
}

export async function saveBusinessEmailSettingsAction(formData: FormData) {
  const parsed = emailSettingsSchema.parse({
    businessId: getString(formData, 'businessId'),
    deliveryMode: getString(formData, 'deliveryMode') || 'in_app',
    fromName: getString(formData, 'fromName'),
    fromEmail: getString(formData, 'fromEmail'),
    replyToEmail: getString(formData, 'replyToEmail'),
    smtpHost: getString(formData, 'smtpHost'),
    smtpPort: getString(formData, 'smtpPort') || undefined,
    smtpSecurity: getString(formData, 'smtpSecurity') || 'starttls',
    smtpUsername: getString(formData, 'smtpUsername'),
    smtpPassword: getString(formData, 'smtpPassword'),
    isEnabled: getString(formData, 'isEnabled'),
  })

  const { supabase, account } = await requireAdminForBusiness(parsed.businessId)
  const existing = await getBusinessEmailSettingsForDelivery(parsed.businessId)
  const smtpPasswordEncrypted = parsed.smtpPassword?.trim()
    ? encryptSecret(parsed.smtpPassword)
    : existing?.smtp_password_encrypted ?? null

  if (parsed.deliveryMode === 'smtp' || parsed.isEnabled === 'true') {
    if (!parsed.fromEmail || !parsed.smtpHost || !parsed.smtpPort) {
      throw new Error('From email, SMTP host, and SMTP port are required for SMTP delivery.')
    }
    if (!smtpPasswordEncrypted && parsed.smtpUsername) {
      throw new Error('Enter the SMTP password or app password before enabling SMTP delivery.')
    }
  }

  const { error } = await supabase
    .from('business_email_settings')
    .upsert({
      business_id: parsed.businessId,
      delivery_mode: parsed.deliveryMode,
      from_name: parsed.fromName || null,
      from_email: parsed.fromEmail || null,
      reply_to_email: parsed.replyToEmail || null,
      smtp_host: parsed.smtpHost || null,
      smtp_port: parsed.smtpPort ?? null,
      smtp_security: parsed.smtpSecurity,
      smtp_username: parsed.smtpUsername || null,
      smtp_password_encrypted: smtpPasswordEncrypted,
      is_enabled: parsed.isEnabled === 'true' && parsed.deliveryMode === 'smtp',
      updated_by: account.id,
      created_by: existing?.created_by ?? account.id,
    }, { onConflict: 'business_id' })

  if (error) throw new Error(error.message)

  await safeLogServerEvent({
    source: 'web_api',
    action: 'business_email_settings_saved',
    result: 'success',
    actorUserId: account.id,
    actorRole: account.role,
    actorName: account.display_name,
    businessId: parsed.businessId,
    moduleKey: 'admin',
    route: '/admin/email-delivery',
    context: {
      delivery_mode: parsed.deliveryMode,
      is_enabled: parsed.isEnabled === 'true' && parsed.deliveryMode === 'smtp',
      smtp_host: parsed.smtpHost || null,
      smtp_port: parsed.smtpPort ?? null,
      smtp_security: parsed.smtpSecurity,
    },
  })

  revalidatePath('/admin/email-delivery')
}

export async function sendBusinessEmailTestAction(formData: FormData) {
  const parsed = testEmailSchema.parse({
    businessId: getString(formData, 'businessId'),
    testRecipient: getString(formData, 'testRecipient'),
  })
  const { supabase, account } = await requireAdminForBusiness(parsed.businessId)
  const settings = await getBusinessEmailSettingsForDelivery(parsed.businessId)

  if (!settings || settings.delivery_mode !== 'smtp' || !settings.smtp_host || !settings.smtp_port || !settings.from_email) {
    throw new Error('Save complete SMTP settings before sending a test email.')
  }

  try {
    await sendSmtpMail({
      host: settings.smtp_host,
      port: settings.smtp_port,
      security: settings.smtp_security,
      username: settings.smtp_username,
      password: getDecryptedSmtpPassword(settings),
      from: settings.from_email,
      fromName: settings.from_name,
      replyTo: settings.reply_to_email,
      to: [parsed.testRecipient],
      subject: 'MedGuard email delivery test',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
          <p>This is a test email from MedGuard.</p>
          <p>If you received this, SMTP delivery is configured correctly for this business.</p>
        </div>
      `,
    })

    await supabase
      .from('business_email_settings')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: 'success',
        last_test_error: null,
        updated_by: account.id,
      })
      .eq('business_id', parsed.businessId)

    await safeLogServerEvent({
      source: 'web_api',
      action: 'business_email_test_sent',
      result: 'success',
      actorUserId: account.id,
      actorRole: account.role,
      actorName: account.display_name,
      businessId: parsed.businessId,
      moduleKey: 'admin',
      route: '/admin/email-delivery',
      context: { test_recipient: parsed.testRecipient },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP test failure'
    await supabase
      .from('business_email_settings')
      .update({
        last_tested_at: new Date().toISOString(),
        last_test_status: 'failed',
        last_test_error: message.slice(0, 1000),
        updated_by: account.id,
      })
      .eq('business_id', parsed.businessId)

    await safeLogServerEvent({
      source: 'web_api',
      action: 'business_email_test_sent',
      result: 'failure',
      actorUserId: account.id,
      actorRole: account.role,
      actorName: account.display_name,
      businessId: parsed.businessId,
      moduleKey: 'admin',
      route: '/admin/email-delivery',
      errorMessage: message,
      context: { test_recipient: parsed.testRecipient },
    })

    throw new Error(message)
  }

  revalidatePath('/admin/email-delivery')
}
