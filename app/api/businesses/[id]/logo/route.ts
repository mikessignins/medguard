import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireScopedBusinessAccess } from '@/lib/route-access'
import { parseBusinessIdParam } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { z } from 'zod'

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
type LogoVariant = 'default' | 'light' | 'dark'
const logoVariantSchema = z.enum(['default', 'light', 'dark'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const parsedBusinessId = parseBusinessIdParam(params.id)
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
    .select('role, business_id')
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
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum 2 MB.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const baseName = variant === 'default' ? parsedBusinessId.value : `${parsedBusinessId.value}-${variant}`
  const storagePath = `${baseName}.${ext}`

  // Remove any existing logo files for this business
  const extensions = ['jpg', 'png', 'webp']
  await Promise.all(
    extensions.map((e) => supabase.storage.from('business-logos').remove([`${baseName}.${e}`]))
  )

  const { error: uploadError } = await supabase.storage
    .from('business-logos')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('business-logos').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl
  const updatePayload =
    variant === 'light'
      ? { logo_url_light: publicUrl }
      : variant === 'dark'
        ? { logo_url_dark: publicUrl }
        : { logo_url: publicUrl }

  const { error: dbError } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('id', parsedBusinessId.value)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ variant, url: publicUrl, ...updatePayload })
}
