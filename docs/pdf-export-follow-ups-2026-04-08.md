# PDF Export Follow-ups — 2026-04-08

These are product and implementation follow-ups to review after the current hardening pass is complete.

## Status — 2026-04-09

- Implemented on the current web branch.
- Emergency declaration PDF now removes the signature field and shows medic notes with author and timestamp.
- Medication, fatigue, and psychosocial PDFs now include explicit medic comment sections where review comments exist.
- All four PDF variants now include an export audit section showing the medic who performed the export and the export timestamp.
- Existing export stamp behaviour remains unchanged because `exported_at` and `exported_by_name` are still written only after PDF generation succeeds.

## Requested review items

- Ensure exported PDFs clearly show the medic who performed the export.
- Ensure medic comments are included in the PDF output where relevant.
- For each medic comment included in a PDF, show:
  - medic name
  - comment date
  - comment time
  - the comment content itself
- Remove the patient signature field from exported PDFs because these forms are not being physically signed.

## Suggested implementation review questions

- Which PDF variants should include medic comments:
  - emergency declarations
  - confidential medication declarations
  - fatigue assessments
  - psychosocial support / post-incident exports
- Should the exporter identity appear in the document header, footer, audit block, or final page summary?
- Should comment timestamps render in local site/business time or a fixed application timezone?
- If a record has multiple comments, should the PDF show all comments or only the final review/outcome note?

## Suggested acceptance checks

- Exported PDF shows the medic display name who triggered the export.
- Exported PDF shows medic comments with author and timestamp in a clear readable section.
- No patient signature field remains in the rendered PDF.
- Existing export audit behaviour remains unchanged:
  - first export is stamped
  - re-exports remain auditable
