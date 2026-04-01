import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { MedDecReviewStatus } from '@/lib/types'
import { hasMedicScopeAccess } from '@/lib/medic-scope'

const VALID_STATUSES: MedDecReviewStatus[] = ['Pending', 'In Review', 'Normal Duties', 'Restricted Duties', 'Unfit for Work']

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: account } = await authClient
    .from('user_accounts').select('role, display_name, business_id, site_ids').eq('id', user.id).single()
  if (!account || account.role !== 'medic') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { medic_review_status, medic_comments, review_required } = body

  if (!VALID_STATUSES.includes(medic_review_status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch current status to enforce forward-only transitions
  const { data: current } = await supabase
    .from('medication_declarations')
    .select('medic_review_status, business_id, site_id')
    .eq('id', params.id)
    .single()

  if (!current) return NextResponse.json({ error: 'Declaration not found' }, { status: 404 })
  if (!hasMedicScopeAccess(account, current)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const OUTCOME_STATUSES: MedDecReviewStatus[] = ['Normal Duties', 'Restricted Duties', 'Unfit for Work']
  const EARLY_STATUSES: MedDecReviewStatus[] = ['Pending', 'In Review']
  if (
    OUTCOME_STATUSES.includes(current.medic_review_status) &&
    EARLY_STATUSES.includes(medic_review_status)
  ) {
    return NextResponse.json(
      { error: 'Cannot revert a reviewed declaration back to an earlier state.' },
      { status: 422 }
    )
  }

  const { error } = await supabase
    .from('medication_declarations')
    .update({
      medic_review_status,
      medic_comments: medic_comments ?? '',
      review_required: !!review_required,
      medic_name: account.display_name,
      medic_reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
