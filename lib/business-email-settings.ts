import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { decryptSecret } from '@/lib/encryption'
import type { SmtpSecurity } from '@/lib/smtp-client'

export type EmailDeliveryMode = 'in_app' | 'smtp'

export interface BusinessEmailSettings {
  business_id: string
  delivery_mode: EmailDeliveryMode
  from_name: string | null
  from_email: string | null
  reply_to_email: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_security: SmtpSecurity
  smtp_username: string | null
  smtp_password_encrypted: string | null
  is_enabled: boolean
  last_tested_at: string | null
  last_test_status: 'success' | 'failed' | null
  last_test_error: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type BusinessEmailSettingsPublic = Omit<BusinessEmailSettings, 'smtp_password_encrypted'> & {
  has_smtp_password: boolean
}

function isMissingSettingsTable(error: { message?: string } | null | undefined) {
  return Boolean(error?.message?.includes('business_email_settings'))
}

export function toPublicEmailSettings(settings: BusinessEmailSettings | null): BusinessEmailSettingsPublic | null {
  if (!settings) return null
  const { smtp_password_encrypted: encryptedPassword, ...rest } = settings
  return {
    ...rest,
    has_smtp_password: Boolean(encryptedPassword),
  }
}

export async function getBusinessEmailSettingsForAdmin(businessId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('business_email_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    if (isMissingSettingsTable(error)) return null
    throw error
  }

  return toPublicEmailSettings((data ?? null) as BusinessEmailSettings | null)
}

export async function getBusinessEmailSettingsForDelivery(businessId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('business_email_settings')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()

  if (error) {
    if (isMissingSettingsTable(error)) return null
    throw error
  }

  return (data ?? null) as BusinessEmailSettings | null
}

export function getDecryptedSmtpPassword(settings: BusinessEmailSettings) {
  return settings.smtp_password_encrypted ? decryptSecret(settings.smtp_password_encrypted) : null
}
