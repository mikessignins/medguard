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
    .select('id, business_id, site_id, worker_snapshot')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (subFetchError) {
    return NextResponse.json({ error: subFetchError.message }, { status: 500 })
  }

  let subsPurged = 0
  if (subTargets && subTargets.length > 0) {
    // Write audit log entries before wiping
    const subAuditRows = subTargets.map(sub => {
      const ws = sub.worker_snapshot as Record<string, unknown> | null
      return {
        submission_id: sub.id,
        worker_name: (ws?.fullName as string) ?? null,
        worker_dob: (ws?.dateOfBirth as string) ?? null,
        site_id: sub.site_id ?? null,
        site_name: null, // site name not fetched in cron for performance; submission_id is the reference
        business_id: sub.business_id,
        medic_user_id: null,
        medic_name: 'Auto-purge (system)',
        purged_at: purgedAt,
        form_type: 'emergency_declaration',
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
    .select('id, business_id, site_id, worker_name, worker_dob')
    .lt('exported_at', cutoff)
    .is('phi_purged_at', null)

  if (medFetchError) {
    return NextResponse.json({ error: medFetchError.message }, { status: 500 })
  }

  let medsPurged = 0
  if (medTargets && medTargets.length > 0) {
    // Write audit log entries before wiping
    const medAuditRows = medTargets.map(m => ({
      submission_id: m.id,
      worker_name: m.worker_name ?? null,
      worker_dob: m.worker_dob ?? null,
      site_id: m.site_id ?? null,
      site_name: null,
      business_id: m.business_id,
      medic_user_id: null,
      medic_name: 'Auto-purge (system)',
      purged_at: purgedAt,
      form_type: 'medication_declaration',
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

  return NextResponse.json({ submissions_purged: subsPurged, med_declarations_purged: medsPurged })
}
