type DeclarationProcessingJob = {
  moduleKey: string
  route: string
  targetId: string
  targetTable: 'submissions' | 'medication_declarations' | 'module_submissions'
  businessId: string
  siteId?: string | null
  triggeredByUserId: string
}

function resolveDeclarationProcessingUrl() {
  if (process.env.SUPABASE_DECLARATION_PROCESSING_URL) {
    return process.env.SUPABASE_DECLARATION_PROCESSING_URL
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return null
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/declaration-processing`
}

export async function enqueueDeclarationProcessing(job: DeclarationProcessingJob) {
  const url = resolveDeclarationProcessingUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(job),
      signal: controller.signal,
    })
  } catch (error) {
    console.warn('[declaration-processing] failed to enqueue job', {
      job,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearTimeout(timeout)
  }
}
