import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireScopedBusinessAccess } from '@/lib/route-access'
import { parseBusinessIdParam } from '@/lib/api-validation'
import { createErrorId, logApiError, requireSameOrigin } from '@/lib/api-security'
import { safeLogServerEvent } from '@/lib/app-event-log'
import { z } from 'zod'

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
type LogoVariant = 'default' | 'light' | 'dark'
const logoVariantSchema = z.enum(['default', 'light', 'dark'])

function detectImageContentType(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  return null
}

function logoUploadFailure(error: unknown) {
  const errorId = createErrorId()
  logApiError('/api/businesses/[id]/logo', errorId, error)

  return NextResponse.json(
    {
      error: 'Logo upload could not be completed because storage permissions or configuration need attention. Contact support with the error ID.',
      errorId,
    },
    { status: 500 },
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const parsedBusinessId = parseBusinessIdParam(resolvedParams.id)
  if (!parsedBusinessId.success) return parsedBusinessId.response

  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, display_name, business_id, superuser_scope')
    .eq('id', userId)
    .single()

  const roleError = requireScopedBusinessAccess(account, parsedBusinessId.value)
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  const rawVariant = formData.get('variant')
  const variantResult = logoVariantSchema.safeParse(rawVariant ?? 'default')
  if (!variantResult.success) {
    return NextResponse.json({ error: 'Invalid logo variant' }, { status: 400 })
  }
  const variant: LogoVariant = variantResult.data
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum 2 MB.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const contentType = detectImageContentType(buffer) ?? file.type
  if (!ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json({ error: 'Invalid file type. Use a real JPEG, PNG, or WebP image.' }, { status: 400 })
  }

  const ext = contentType === 'image/webp' ? 'webp' : contentType === 'image/png' ? 'png' : 'jpg'
  const baseName = variant === 'default' ? parsedBusinessId.value : `${parsedBusinessId.value}-${variant}`
  const storagePath = `${baseName}.${ext}`
  const service = createServiceClient()

  // Remove any existing logo files for this business
  const extensions = ['jpg', 'png', 'webp']
  await Promise.all(
    extensions.map((e) => service.storage.from('business-logos').remove([`${baseName}.${e}`]))
  )

  const { error: uploadError } = await service.storage
    .from('business-logos')
    .upload(storagePath, buffer, { contentType, upsert: true })

  if (uploadError) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'business_logo_updated',
      result: 'failure',
      actorUserId: userId,
      actorRole: account?.role,
      actorName: account?.display_name,
      businessId: parsedBusinessId.value,
      route: '/api/businesses/[id]/logo',
      targetId: parsedBusinessId.value,
      errorMessage: uploadError.message,
      context: { variant, content_type: contentType, reported_content_type: file.type, file_size: file.size },
    })
    return logoUploadFailure(uploadError)
  }

  const { data: urlData } = service.storage.from('business-logos').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl
  const updatePayload =
    variant === 'light'
      ? { logo_url_light: publicUrl }
      : variant === 'dark'
        ? { logo_url_dark: publicUrl }
        : { logo_url: publicUrl }

  const { error: dbError } = await service
    .from('businesses')
    .update(updatePayload)
    .eq('id', parsedBusinessId.value)

  if (dbError) {
    await safeLogServerEvent({
      source: 'web_api',
      action: 'business_logo_updated',
      result: 'failure',
      actorUserId: userId,
      actorRole: account?.role,
      actorName: account?.display_name,
      businessId: parsedBusinessId.value,
      route: '/api/businesses/[id]/logo',
      targetId: parsedBusinessId.value,
      errorMessage: dbError.message,
      context: { variant, storage_path: storagePath },
    })
    return logoUploadFailure(dbError)
  }

  await safeLogServerEvent({
    source: 'web_api',
    action: 'business_logo_updated',
    result: 'success',
    actorUserId: userId,
    actorRole: account?.role,
    actorName: account?.display_name,
    businessId: parsedBusinessId.value,
    route: '/api/businesses/[id]/logo',
    targetId: parsedBusinessId.value,
    context: {
      variant,
      storage_path: storagePath,
      content_type: contentType,
      reported_content_type: file.type,
      file_size: file.size,
    },
  })

  return NextResponse.json({ variant, url: publicUrl, ...updatePayload })
}
