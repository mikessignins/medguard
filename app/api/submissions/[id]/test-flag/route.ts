import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { z } from 'zod'

const testFlagSchema = z.object({
  is_test: z.boolean(),
})

// PATCH /api/submissions/[id]/test-flag
// Body: { is_test: boolean }
// Superuser only. Manually marks or unmarks a submission as a test form.
// The DB trigger (lock_is_test_when_reviewed) will reject this if the
// submission has already been moved past 'New' status.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsedId = parseUuidParam(params.id, 'Submission id')
  if (!parsedId.success) return parsedId.response

  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

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

  const parsed = await parseJsonBody(req, testFlagSchema)
  if (!parsed.success) return parsed.response
  const body = parsed.data

  // Verify the submission exists and is still in 'New' status (only state where is_test is mutable).
  const { data: submission } = await supabase
    .from('submissions')
    .select('status')
    .eq('id', parsedId.value)
    .single()

  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  if (submission.status !== 'New') {
    return NextResponse.json(
      { error: 'is_test can only be changed while the submission is in Awaiting Review (New) status.' },
      { status: 422 }
    )
  }

  const { error } = await supabase
    .from('submissions')
    .update({ is_test: body.is_test })
    .eq('id', parsedId.value)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
