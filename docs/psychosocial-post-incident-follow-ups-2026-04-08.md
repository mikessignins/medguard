# Psychosocial Post-Incident Follow-ups — 2026-04-08

These are product and implementation issues to review after the current hardening pass.

## Status — 2026-04-09

- Implemented a safer worker search-and-select flow on the current web branch.
- Post-incident case creation now requires selecting an exact MedGuard worker account from site-scoped results instead of relying on free-text name matching.
- The selected worker's canonical display name is now written into the post-incident payload server-side, which keeps new dashboard and detail records consistent.
- Existing psychosocial queue, detail, and PDF views now fall back to the linked worker account display name when an older payload is missing the worker snapshot.
- Differentiators currently available in the existing schema are worker email and MedGuard account ID. If the product still needs DOB, employee ID, company, or role in the picker, that will require additional worker profile fields to be exposed in the web app or database.

## Current issues reported

- The post-incident workflow does not reliably let medics look up workers who already exist in the database.
- Worker lookup currently relies too heavily on name matching.
- The workflow does not adequately handle multiple workers at the same site with the same name.
- There is no clear, safe way for a medic to distinguish between same-name workers during case creation.
- Worker names are not reliably showing in the psychosocial dashboard after form submission, which makes review triage and follow-up harder for medics.

## Why this matters

- A medic can be blocked from creating the correct welfare case even when the worker already exists.
- Same-name collisions create a patient-safety and privacy risk because the wrong worker could be attached to the case.
- Error states can look like bugs to end users when the underlying issue is ambiguous identity resolution.
- Missing worker names in the dashboard reduce the medic's ability to safely identify, prioritise, and continue follow-up on submitted psychosocial cases.

## Suggested review directions

- Add a proper worker search/select experience instead of plain name matching.
- Show differentiators in search results such as:
  - date of birth
  - employee ID
  - company
  - role
  - site
- Prefer exact worker selection from a returned list over free-text fallback.
- Revisit whether raw worker ID fallback should remain user-facing or be replaced with a safer UI flow.
- Review the API error copy so unresolved or ambiguous matches guide the medic toward the correct next step.
- Trace where worker display names are expected to come from in the psychosocial dashboard and ensure the submitted payload, row mapping, and UI rendering all preserve the worker name consistently.

## Suggested acceptance checks

- A medic can find an existing worker by searching without needing to know the internal worker ID.
- Same-name workers at the same site can be distinguished safely.
- The selected worker is unambiguous before the case is created.
- Error messages explain what the medic needs to do next when no unique match is available.
- Submitted psychosocial cases show the correct worker name in the medic dashboard and detail views.

## Remaining UI follow-up

- Review the remaining hard-coded dark styling in the psychosocial incident follow-up views for light mode.
