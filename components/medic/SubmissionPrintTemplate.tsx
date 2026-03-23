import type { WorkerSnapshot, Decision, ScriptUpload } from '@/lib/types'

// ─── Inline style tokens ────────────────────────────────────────────────────
const S = {
  page: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '9pt',
    color: '#000',
    background: '#fff',
    paddingBottom: '10px',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '2px solid #000',
    paddingBottom: '5px',
    marginBottom: '10px',
  },
  pageHeaderText: { fontWeight: 'bold', fontSize: '9pt' },
  title: { fontWeight: '900', fontSize: '20pt', margin: '4px 0 6px', lineHeight: 1.1 },
  intro: { fontSize: '8pt', lineHeight: 1.4, marginBottom: '10px' },
  accentText: { color: '#CC3300' },
  sectionHdr: {
    background: '#2D2D3E',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '8pt',
    letterSpacing: '0.06em',
    padding: '4px 7px',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, border: '1px solid #bbb' },
  tdLabel: {
    fontSize: '7.5pt',
    fontWeight: 'bold',
    letterSpacing: '0.03em',
    padding: '3px 6px',
    background: '#f4f4f4',
    borderRight: '1px solid #bbb',
    whiteSpace: 'nowrap' as const,
    width: '18%',
    verticalAlign: 'top' as const,
  },
  tdValue: {
    fontSize: '9pt',
    padding: '3px 6px',
    verticalAlign: 'top' as const,
    width: '32%',
  },
  questionRow: {
    borderBottom: '1px solid #bbb',
    padding: '5px 7px',
  },
  questionLabel: { fontWeight: 'bold', fontSize: '7.5pt', letterSpacing: '0.03em', marginBottom: '3px' },
  questionValue: { fontSize: '9pt', minHeight: '18px' },
  footer: {
    marginTop: '16px',
    borderTop: '1px solid #ccc',
    paddingTop: '4px',
  },
  footerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '7.5pt',
    marginBottom: '2px',
  },
  footerDisclaimer: { fontSize: '7pt', color: '#CC3300', textAlign: 'center' as const, margin: 0 },
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '4px',
    padding: '2px 0',
    fontSize: '8pt',
  },
}

function fmt(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return '—' }
}

function fmtFull(value: string | null | undefined): string {
  if (!value) return '—'
  try {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

function PageHeader() {
  return (
    <div style={S.pageHeader}>
      <span style={S.pageHeaderText}>EMERGENCY MEDICAL INFORMATION FORM</span>
      {/* To use the real MRL logo: place the file at /public/mrl-logo.png */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mrl-logo.png" alt="Mineral Resources" style={{ height: '28px' }} />
    </div>
  )
}

function SectionHdr({ title }: { title: string }) {
  return <div style={S.sectionHdr}>{title}</div>
}

function PageFooter({ page, total }: { page: number; total: number }) {
  return (
    <div style={S.footer}>
      <div style={S.footerRow}>
        <span>ISSUE DATE: 14/11/2023</span>
        <span>MRL-SAF-FRM-0097_01</span>
        <span>PAGE {page} OF {total}</span>
      </div>
      <p style={S.footerDisclaimer}>
        Printed copies of this document are not controlled. Please ensure that this is the latest available version before use.
      </p>
    </div>
  )
}

interface Props {
  ws: WorkerSnapshot | null
  submission: {
    id: string
    role: string
    visit_date: string | null
    shift_type: string
    status: string
    consent_given: boolean
    submitted_at: string | null
    exported_at: string | null
    phi_purged_at: string | null
  }
  siteName: string
  businessName: string
  decision: Decision | null
  exportedAt: string | null
  scriptUploads: ScriptUpload[]
}

export default function SubmissionPrintTemplate({
  ws, submission, siteName, businessName, decision, exportedAt, scriptUploads,
}: Props) {
  const medications = ws?.currentMedications || []
  const conditions = ws?.conditionChecklist ? Object.entries(ws.conditionChecklist) : []
  const half = Math.ceil(conditions.length / 2)
  const col1 = conditions.slice(0, half)
  const col2 = conditions.slice(half)
  const disclosedConditions = conditions.filter(([, v]) => v?.answer === true)
  const hasScripts = scriptUploads.filter(s => !!s.signedUrl).length > 0
  const totalPages = hasScripts ? 3 : 2

  return (
    <div style={{ fontFamily: 'Arial, Helvetica, sans-serif', background: '#fff', color: '#000' }}>

      {/* ═══ PAGE 1 ═══════════════════════════════════════════════════════ */}
      <div style={S.page}>
        <PageHeader />

        <h1 style={S.title}>EMERGENCY MEDICAL INFORMATION FORM</h1>

        <p style={S.intro}>
          Please complete this form truthfully and honestly as this will be used to assist the emergency management
          team. This information could save your life in the event of an emergency.{' '}
          <span style={S.accentText}>
            If any conditions on this form change at any time, you must notify the site Emergency Services Officers or Medics.
          </span>
        </p>

        {/* PERSONAL DETAILS */}
        <div style={{ marginBottom: '7px' }}>
          <SectionHdr title="PERSONAL DETAILS" />
          <table style={S.table}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #bbb' }}>
                <td style={S.tdLabel}>FULL NAME</td>
                <td style={S.tdValue}>{ws?.fullName || '—'}</td>
                <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>DATE OF BIRTH</td>
                <td style={S.tdValue}>{ws?.dateOfBirth ? ws.dateOfBirth.slice(0, 10) : '—'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #bbb' }}>
                <td style={S.tdLabel}>EMAIL ADDRESS</td>
                <td style={S.tdValue}>{ws?.emailAddress || '—'}</td>
                <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>MOBILE NUMBER</td>
                <td style={S.tdValue}>{ws?.mobileNumber || '—'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #bbb' }}>
                <td style={S.tdLabel}>COMPANY</td>
                <td style={S.tdValue}>{ws?.company || businessName || '—'}</td>
                <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>DEPARTMENT</td>
                <td style={S.tdValue}>{ws?.department || '—'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>SUPERVISOR</td>
                <td style={S.tdValue}>{ws?.supervisor || '—'}</td>
                <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>SITE LOCATION</td>
                <td style={S.tdValue}>{ws?.siteLocation || siteName || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* EMERGENCY CONTACT */}
        <div style={{ marginBottom: '7px' }}>
          <SectionHdr title="EMERGENCY CONTACT" />
          <table style={S.table}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #bbb' }}>
                <td style={S.tdLabel}>FULL NAME</td>
                <td style={S.tdValue}>{ws?.emergencyContactName || '—'}</td>
                <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>RELATIONSHIP</td>
                <td style={S.tdValue}>{ws?.emergencyContactRelationship || '—'}</td>
              </tr>
              <tr>
                <td style={S.tdLabel}>MOBILE NUMBER</td>
                <td style={S.tdValue}>{ws?.emergencyContactMobile || '—'}</td>
                <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>OTHER CONTACT</td>
                <td style={S.tdValue}>{ws?.emergencyContactOther || '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* MEDICAL HISTORY */}
        <div>
          <SectionHdr title="MEDICAL HISTORY" />
          <div style={{ border: '1px solid #bbb' }}>

            {/* Allergies */}
            <div style={{ ...S.questionRow }}>
              <p style={S.questionLabel}>
                DO YOU HAVE ANY KNOWN ALLERGIES TO MEDICATIONS, FOOD, CHEMICALS, ANIMALS, INSECTS ETC.?
                IF YES, ARE YOU ANAPHYLACTIC?
              </p>
              <p style={S.questionValue}>
                {ws?.allergies || 'None reported'}
                {ws?.anaphylactic ? ' · ANAPHYLACTIC: YES' : ''}
              </p>
            </div>

            {/* Medications */}
            <div style={{ ...S.questionRow, borderBottom: 'none' }}>
              <p style={S.questionLabel}>
                ARE YOU TAKING ANY PRESCRIBED OR NON-PRESCRIBED MEDICATIONS, HERBAL REMEDIES, SUPPLEMENTS OR MULTI-VITAMINS?
              </p>
              <p style={{ ...S.accentText, fontSize: '7.5pt', fontWeight: 'bold', margin: '2px 0 4px' }}>
                IF TAKING ANY PRESCRIBED MEDICATION, A COPY OF YOUR PRESCRIPTION IS TO BE PROVIDED
              </p>
              {medications.length > 0 ? (
                <table style={{ ...S.table, fontSize: '8pt', marginTop: '2px' }}>
                  <thead>
                    <tr style={{ background: '#ebebeb' }}>
                      <th style={{ padding: '2px 5px', textAlign: 'left', border: '1px solid #ccc', width: '30%' }}>MEDICATION</th>
                      <th style={{ padding: '2px 5px', textAlign: 'left', border: '1px solid #ccc', width: '20%' }}>DOSAGE</th>
                      <th style={{ padding: '2px 5px', textAlign: 'left', border: '1px solid #ccc', width: '25%' }}>FREQUENCY</th>
                      <th style={{ padding: '2px 5px', textAlign: 'left', border: '1px solid #ccc' }}>CATEGORY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {medications.map((med, i) => (
                      <tr key={med.id || i}>
                        <td style={{ padding: '2px 5px', border: '1px solid #ccc' }}>{med.name || '—'}</td>
                        <td style={{ padding: '2px 5px', border: '1px solid #ccc' }}>{med.dosage || '—'}</td>
                        <td style={{ padding: '2px 5px', border: '1px solid #ccc' }}>{med.frequency || '—'}</td>
                        <td style={{
                          padding: '2px 5px', border: '1px solid #ccc',
                          color: med.reviewFlag && med.reviewFlag !== 'none' ? '#CC3300' : undefined,
                          fontWeight: med.reviewFlag && med.reviewFlag !== 'none' ? 'bold' : undefined,
                        }}>
                          {med.reviewFlag && med.reviewFlag !== 'none' ? med.reviewFlag : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ ...S.questionValue }}>No medications reported</p>
              )}

              {/* Script upload note */}
              {scriptUploads.length > 0 && (
                <p style={{ fontSize: '7.5pt', marginTop: '4px', color: '#555' }}>
                  &#9432; Prescription script images attached on page 3.
                </p>
              )}
            </div>
          </div>
        </div>

        <PageFooter page={1} total={totalPages} />
      </div>

      {/* ═══ PAGE 2 ═══════════════════════════════════════════════════════ */}
      <div style={{ ...S.page, pageBreakBefore: 'always' }}>
        <PageHeader />

        {/* MEDICAL HISTORY (CONTINUED) */}
        <div style={{ marginBottom: '7px' }}>
          <SectionHdr title="MEDICAL HISTORY (CONTINUED)" />
          <div style={{ border: '1px solid #bbb' }}>

            {/* Tetanus */}
            <div style={{ ...S.questionRow }}>
              <p style={S.questionLabel}>WHEN WAS YOUR LAST TETANUS INJECTION?</p>
              <div style={S.checkRow}>
                <span>{ws?.tetanus?.immunised ? '☑ Immunised' : '☐ Immunised'}</span>
                <span style={{ marginLeft: '12px' }}>
                  Date of last injection:{' '}
                  <strong>{ws?.tetanus?.lastDoseDate ? fmt(ws.tetanus.lastDoseDate) : '—'}</strong>
                </span>
              </div>
            </div>

            {/* Hepatitis B */}
            <div style={{ ...S.questionRow }}>
              <p style={S.questionLabel}>ARE YOU IMMUNISED AGAINST HEPATITIS B?</p>
              <div style={S.checkRow}>
                <span>{ws?.hepatitisB?.immunised ? '☑ Immunised' : '☐ Immunised'}</span>
                <span style={{ marginLeft: '12px' }}>
                  Date of last injection:{' '}
                  <strong>{ws?.hepatitisB?.lastDoseDate ? fmt(ws.hepatitisB.lastDoseDate) : '—'}</strong>
                </span>
              </div>
            </div>

            {/* Conditions checklist */}
            <div style={{ ...S.questionRow, borderBottom: 'none' }}>
              <p style={{ ...S.questionLabel, marginBottom: '5px' }}>
                HAVE YOU EVER SUFFERED FROM ANY OF THE FOLLOWING?
              </p>
              {conditions.length > 0 ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
                  <tbody>
                    {col1.map(([key, val], i) => {
                      const right = col2[i]
                      return (
                        <tr key={key} style={{ borderBottom: '1px solid #e8e8e8' }}>
                          {/* Left condition */}
                          <td style={{ padding: '2px 4px', width: '34%' }}>{val?.label || key}</td>
                          <td style={{ padding: '2px 4px', width: '4%', textAlign: 'center' }}>
                            {val?.answer ? '☑' : '☐'}
                          </td>
                          <td style={{ padding: '2px 4px', width: '5%', color: val?.answer ? '#CC3300' : '#666' }}>
                            {val?.answer ? 'Yes' : 'No'}
                          </td>
                          <td style={{ padding: '2px 4px', width: '4px', background: '#e0e0e0' }} />
                          {/* Right condition */}
                          {right ? (
                            <>
                              <td style={{ padding: '2px 4px 2px 8px', width: '34%' }}>{right[1]?.label || right[0]}</td>
                              <td style={{ padding: '2px 4px', width: '4%', textAlign: 'center' }}>
                                {right[1]?.answer ? '☑' : '☐'}
                              </td>
                              <td style={{ padding: '2px 4px', color: right[1]?.answer ? '#CC3300' : '#666' }}>
                                {right[1]?.answer ? 'Yes' : 'No'}
                              </td>
                            </>
                          ) : <td colSpan={3} />}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ fontSize: '8pt', color: '#888' }}>No conditions checklist data</p>
              )}
            </div>

            {/* Disclosed condition details */}
            {disclosedConditions.length > 0 && (
              <div style={{ ...S.questionRow, borderTop: '1px solid #bbb', borderBottom: 'none' }}>
                <p style={{ ...S.questionLabel, marginBottom: '4px' }}>
                  IF YOU ANSWERED YES TO ANY OF THE ABOVE, PLEASE PROVIDE DETAILS:
                </p>
                {disclosedConditions.map(([key, val]) => (
                  <div key={key} style={{ marginBottom: '4px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '8pt' }}>{val?.label || key}: </span>
                    <span style={{ fontSize: '9pt' }}>{val?.detail || 'No further details provided'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* DECLARATION */}
        <div style={{ marginBottom: '7px' }}>
          <SectionHdr title="DECLARATION" />
          <div style={{ border: '1px solid #bbb', padding: '5px 7px' }}>
            <p style={{ fontSize: '8.5pt', marginBottom: '8px' }}>
              In signing this document below, I declare that the above information is true and factual to the best of my knowledge.
            </p>
            <table style={S.table}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #bbb' }}>
                  <td style={{ ...S.tdLabel, width: '15%' }}>FULL NAME</td>
                  <td style={{ ...S.tdValue, width: '35%' }}>{ws?.fullName || '—'}</td>
                  <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb', width: '15%' }}>SIGNATURE</td>
                  <td style={S.tdValue} />
                </tr>
                <tr>
                  <td style={S.tdLabel}>DATE</td>
                  <td style={S.tdValue}>{fmt(submission.visit_date || submission.submitted_at)}</td>
                  <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>EMPLOYEE ID</td>
                  <td style={S.tdValue}>{ws?.employeeId || '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* MEDIC DECISION — web app addition */}
        <div style={{ marginBottom: '7px' }}>
          <SectionHdr title="MEDIC REVIEW — MedM8 Web" />
          <div style={{ border: '1px solid #bbb' }}>
            <table style={S.table}>
              <tbody>
                <tr style={{ borderBottom: '1px solid #bbb' }}>
                  <td style={S.tdLabel}>SITE</td>
                  <td style={S.tdValue}>{siteName}</td>
                  <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>BUSINESS</td>
                  <td style={S.tdValue}>{businessName}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #bbb' }}>
                  <td style={S.tdLabel}>VISIT DATE</td>
                  <td style={S.tdValue}>{fmt(submission.visit_date)}</td>
                  <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>SHIFT</td>
                  <td style={S.tdValue}>{submission.shift_type || '—'}</td>
                </tr>
                <tr style={{ borderBottom: decision ? '1px solid #bbb' : undefined }}>
                  <td style={S.tdLabel}>STATUS</td>
                  <td style={S.tdValue}>{submission.status}</td>
                  <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>EXPORTED</td>
                  <td style={S.tdValue}>{exportedAt ? fmtFull(exportedAt) : '—'}</td>
                </tr>
                {decision && (
                  <tr>
                    <td style={S.tdLabel}>DECISION</td>
                    <td style={{ ...S.tdValue, color: decision.outcome === 'Approved' ? '#166534' : '#991b1b', fontWeight: 'bold' }}>
                      {decision.outcome}
                    </td>
                    <td style={{ ...S.tdLabel, borderLeft: '1px solid #bbb' }}>DECIDED</td>
                    <td style={S.tdValue}>{fmtFull(decision.decided_at)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            {decision?.note && (
              <div style={{ padding: '4px 7px', borderTop: '1px solid #bbb', fontSize: '8.5pt' }}>
                <strong>Note:</strong> {decision.note}
              </div>
            )}
          </div>
        </div>

        <PageFooter page={2} total={totalPages} />
      </div>

      {/* ═══ PAGE 3 — PRESCRIPTION SCRIPTS (only if uploads exist) ══════════ */}
      {hasScripts && (
        <div style={{ ...S.page, pageBreakBefore: 'always' }}>
          <PageHeader />
          <div style={{ marginBottom: '10px' }}>
            <SectionHdr title="PRESCRIPTION SCRIPTS" />
            <p style={{ fontSize: '8pt', color: '#555', margin: '4px 0 10px' }}>
              Copies of prescription scripts provided by the worker at time of declaration.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
              {scriptUploads.filter(s => !!s.signedUrl).map(upload => (
                <div key={upload.medicationId} style={{ width: '46%', pageBreakInside: 'avoid' }}>
                  <p style={{ fontSize: '8pt', fontWeight: 'bold', marginBottom: '4px', color: '#2D2D3E' }}>
                    {upload.medicationName}
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={upload.signedUrl!}
                    alt={`Script for ${upload.medicationName}`}
                    style={{ width: '100%', maxHeight: '320px', objectFit: 'contain', border: '1px solid #bbb', borderRadius: '4px' }}
                  />
                </div>
              ))}
            </div>
          </div>
          <PageFooter page={3} total={totalPages} />
        </div>
      )}
    </div>
  )
}
