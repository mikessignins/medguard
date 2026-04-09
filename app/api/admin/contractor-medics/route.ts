import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { parseJsonBody } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { z } from 'zod'

export const runtime = 'nodejs'

const contractorMedicSchema = z.object({
  display_name: z.string().trim().min(1, 'Full name is required').max(120, 'Full name is too long'),
  email: z.string().trim().email('A valid email address is required'),
  password: z.string().min(8, 'Temporary password must be at least 8 characters'),
  site_ids: z.array(z.string().trim().min(1)).default([]),
  contract_end_date: z.union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Contract end date must be in YYYY-MM-DD format'),
    z.null(),
  ]).optional().default(null),
})

export async function POST(req: Request) {
  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role, business_id')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'admin')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, contractorMedicSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  const normalizedSiteIds = Array.from(new Set(body.site_ids))
  if (normalizedSiteIds.length > 0) {
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id')
      .eq('business_id', account!.business_id)
      .in('id', normalizedSiteIds)

    if (sitesError) {
      return NextResponse.json({ error: 'Unable to validate selected sites.' }, { status: 500 })
    }

    if ((sites ?? []).length !== normalizedSiteIds.length) {
      return NextResponse.json({ error: 'One or more selected sites are invalid for this business.' }, { status: 400 })
    }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
    email: body.email,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      display_name: body.display_name,
      role: 'medic',
      business_id: account!.business_id,
    },
  })

  if (createUserError || !createdUser.user) {
    return NextResponse.json(
      { error: createUserError?.message ?? 'Failed to create medic sign-in account.' },
      { status: 400 },
    )
  }

  const medicUserId = createdUser.user.id
  const { error: userIndexError } = await service
    .from('user_index')
    .upsert({
      user_id: medicUserId,
      business_id: account!.business_id,
    }, { onConflict: 'user_id' })

  if (userIndexError) {
    await service.auth.admin.deleteUser(medicUserId).catch(() => undefined)
    return NextResponse.json(
      { error: userIndexError.message || 'Failed to create business mapping for medic account.' },
      { status: 500 },
    )
  }

  const { error: accountInsertError } = await service
    .from('user_accounts')
    .insert({
      id: medicUserId,
      business_id: account!.business_id,
      display_name: body.display_name,
      email: body.email,
      role: 'medic',
      site_ids: normalizedSiteIds,
      contract_end_date: body.contract_end_date,
    })

  if (accountInsertError) {
    await service.auth.admin.deleteUser(medicUserId).catch(() => undefined)
    try {
      await service.from('user_index').delete().eq('user_id', medicUserId)
    } catch {}
    return NextResponse.json(
      { error: accountInsertError.message || 'Failed to create medic profile.' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: medicUserId,
      display_name: body.display_name,
      email: body.email,
      role: 'medic',
      site_ids: normalizedSiteIds,
      contract_end_date: body.contract_end_date,
    },
  })
}
