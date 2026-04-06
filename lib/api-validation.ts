import { NextResponse } from 'next/server'
import { z, type ZodType } from 'zod'

type ParseSuccess<T> = { success: true, data: T }
type ParseFailure = { success: false, response: NextResponse<{ error: string }> }

function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request payload'

  const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
  return `${path}${issue.message}`
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<ParseSuccess<T> | ParseFailure> {
  let body: unknown

  try {
    body = await req.json()
  } catch {
    return {
      success: false,
      response: NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }),
    }
  }

  const result = schema.safeParse(body)
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json({ error: formatZodError(result.error) }, { status: 400 }),
    }
  }

  return { success: true, data: result.data }
}
