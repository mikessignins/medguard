import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requireRole } from '@/lib/route-access'
import { parseJsonBody, parseUuidParam } from '@/lib/api-validation'
import { requireSameOrigin } from '@/lib/api-security'
import { z } from 'zod'

const feedbackUpdateSchema = z.object({
  status: z.enum(['Unread', 'Read', 'Planned', 'Implemented', 'Archived']),
  superuser_note: z.string().max(5000, 'Note is too long').optional().default(''),
})

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsedId = parseUuidParam(params.id, 'Feedback id')
  if (!parsedId.success) return parsedId.response

  const csrfError = requireSameOrigin(req)
  if (csrfError) return csrfError

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const authError = requireAuthenticatedUser(userId)
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })

  const { data: account } = await supabase
    .from('user_accounts')
    .select('role')
    .eq('id', userId)
    .single()

  const roleError = requireRole(account, 'superuser')
  if (roleError) return NextResponse.json({ error: roleError.error }, { status: roleError.status })

  const parsed = await parseJsonBody(req, feedbackUpdateSchema)
  if (!parsed.success) return parsed.response
  const { status, superuser_note } = parsed.data

  const { error } = await supabase
    .from('feedback')
    .update({ status, superuser_note, status_updated_at: new Date().toISOString() })
    .eq('id', parsedId.value)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
