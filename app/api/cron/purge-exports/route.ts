import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Vercel invokes this daily with Authorization: Bearer <CRON_SECRET>
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Find submissions exported more than 7 days ago that haven't been purged yet
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const purgedAt = new Date().toISOString()

  // ── Submissions ─────────────────────────────────────────────────────────────
  const { data: subTargets, error: subFetchError } = await supabase
    .from('submissions')
    .select('id, business_id, site_id, site_name, worker_snapshot, exported_at, exported_by_name, decision')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (subFetchError) {
    return NextResponse.json({ error: subFetchError.message }, { status: 500 })
  }

  let subsPurged = 0
  if (subTargets && subTargets.length > 0) {
    // Write audit log entries before wiping — captures full chain: approved → exported → purged
    const subAuditRows = subTargets.map(sub => {
      const ws       = sub.worker_snapshot as Record<string, unknown> | null
      const decision = sub.decision as Record<string, unknown> | null
      return {
        submission_id:     sub.id,
        worker_name:       (ws?.fullName as string) ?? null,
        worker_dob:        (ws?.dateOfBirth as string) ?? null,
        site_id:           sub.site_id ?? null,
        site_name:         sub.site_name ?? null,
        business_id:       sub.business_id,
        medic_user_id:     null,
        medic_name:        'Auto-purge (system)',
        purged_at:         purgedAt,
        form_type:         'emergency_declaration',
        exported_at:       sub.exported_at ?? null,
        exported_by_name:  sub.exported_by_name ?? null,
        approved_by_name:  (decision?.decided_by_name as string) ?? null,
        approved_at:       (decision?.decided_at as string) ?? null,
      }
    })
    await supabase.from('purge_audit_log').insert(subAuditRows)

    const { error: subUpdateError } = await supabase
      .from('submissions')
      .update({
        phi_purged_at: purgedAt,
        worker_snapshot: null,
        script_uploads: null,
      })
      .in('id', subTargets.map(r => r.id))

    if (subUpdateError) {
      return NextResponse.json({ error: subUpdateError.message }, { status: 500 })
    }
    subsPurged = subTargets.length
  }

  // ── Medication Declarations ──────────────────────────────────────────────────
  const { data: medTargets, error: medFetchError } = await supabase
    .from('medication_declarations')
    .select('id, business_id, site_id, site_name, worker_name, worker_dob, exported_at, exported_by_name, medic_name, medic_reviewed_at')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (medFetchError) {
    return NextResponse.json({ error: medFetchError.message }, { status: 500 })
  }

  let medsPurged = 0
  if (medTargets && medTargets.length > 0) {
    const medAuditRows = medTargets.map(m => ({
      submission_id:     m.id,
      worker_name:       m.worker_name ?? null,
      worker_dob:        m.worker_dob ?? null,
      site_id:           m.site_id ?? null,
      site_name:         m.site_name ?? null,
      business_id:       m.business_id,
      medic_user_id:     null,
      medic_name:        'Auto-purge (system)',
      purged_at:         purgedAt,
      form_type:         'medication_declaration',
      exported_at:       m.exported_at ?? null,
      exported_by_name:  m.exported_by_name ?? null,
      approved_by_name:  m.medic_name ?? null,
      approved_at:       m.medic_reviewed_at ?? null,
    }))
    await supabase.from('purge_audit_log').insert(medAuditRows)

    const { error: medUpdateError } = await supabase
      .from('medication_declarations')
      .update({
        phi_purged_at: purgedAt,
        worker_name: '',
        worker_dob: '',
        employer: '',
        department: '',
        job_title: '',
        medications: [],
        script_uploads: [],
      })
      .in('id', medTargets.map(r => r.id))

    if (medUpdateError) {
      return NextResponse.json({ error: medUpdateError.message }, { status: 500 })
    }
    medsPurged = medTargets.length
  }

  const result = { submissions_purged: subsPurged, med_declarations_purged: medsPurged }

  // Record successful run so admin dashboard can detect silent cron failures
  await supabase.from('cron_health_log').upsert(
    { cron_name: 'purge-exports', last_run_at: new Date().toISOString(), last_result: result },
    { onConflict: 'cron_name' }
  )

  return NextResponse.json(result)
}
