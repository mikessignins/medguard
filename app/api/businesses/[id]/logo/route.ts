import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const MAX_SIZE = 2 * 1024 * 1024 // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
type LogoVariant = 'default' | 'light' | 'dark'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!account || account.role !== 'superuser') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('logo') as File | null
  const rawVariant = formData.get('variant')
  const variant: LogoVariant = rawVariant === 'light' || rawVariant === 'dark' ? rawVariant : 'default'
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use JPEG, PNG, or WebP.' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum 2 MB.' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'image/webp' ? 'webp' : file.type === 'image/png' ? 'png' : 'jpg'
  const baseName = variant === 'default' ? params.id : `${params.id}-${variant}`
  const storagePath = `${baseName}.${ext}`

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Remove any existing logo files for this business
  const extensions = ['jpg', 'png', 'webp']
  await Promise.all(
    extensions.map(e => service.storage.from('business-logos').remove([`${baseName}.${e}`]))
  )

  const { error: uploadError } = await service.storage
    .from('business-logos')
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
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
    .eq('id', params.id)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ variant, url: publicUrl, ...updatePayload })
}
