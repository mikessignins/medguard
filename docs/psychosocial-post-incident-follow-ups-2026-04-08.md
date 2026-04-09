# Psychosocial Post-Incident Follow-ups — 2026-04-08

These are product and implementation issues to review after the current hardening pass.

## Current issues reported

- The post-incident workflow does not reliably let medics look up workers who already exist in the database.
- Worker lookup currently relies too heavily on name matching.
- The workflow does not adequately handle multiple workers at the same site with the same name.
- There is no clear, safe way for a medic to distinguish between same-name workers during case creation.

## Why this matters

- A medic can be blocked from creating the correct welfare case even when the worker already exists.
- Same-name collisions create a patient-safety and privacy risk because the wrong worker could be attached to the case.
- Error states can look like bugs to end users when the underlying issue is ambiguous identity resolution.

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

## Suggested acceptance checks

- A medic can find an existing worker by searching without needing to know the internal worker ID.
- Same-name workers at the same site can be distinguished safely.
- The selected worker is unambiguous before the case is created.
- Error messages explain what the medic needs to do next when no unique match is available.
