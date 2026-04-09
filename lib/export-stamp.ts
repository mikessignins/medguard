import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

type ExportableTable = 'submissions' | 'medication_declarations' | 'module_submissions'

interface MarkExportedArgs {
  supabase: SupabaseClient
  table: ExportableTable
  id: string
  exportedByName: string | null | undefined
  moduleKey?: string
}

interface MarkExportedResult {
  exportedAt: string
  stamped: boolean
  error: PostgrestError | null
}

export async function markExportedIfNeeded({
  supabase,
  table,
  id,
  exportedByName,
  moduleKey,
}: MarkExportedArgs): Promise<MarkExportedResult> {
  const exportedAt = new Date().toISOString()

  let query = supabase
    .from(table)
    .update({
      exported_at: exportedAt,
      exported_by_name: exportedByName ?? null,
    })
    .eq('id', id)
    .is('exported_at', null)

  if (moduleKey) {
    query = query.eq('module_key', moduleKey)
  }

  const { data, error } = await query.select('id').maybeSingle()

  return {
    exportedAt,
    stamped: Boolean(data),
    error,
  }
}
