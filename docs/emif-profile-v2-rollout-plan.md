# EMIF Profile V2 Rollout Plan

## Goal
Update the worker Medical Profile (iOS) and wizard flow so it captures the new EMIF dataset, then continue using the existing emergency declaration submit action to snapshot profile data into submissions.

This approach avoids critical DB schema changes by storing new fields inside the existing JSON snapshot payload (`worker_snapshot`) and/or `site_specific_answers` metadata.

## Product rules
- Worker completes/updates Medical Profile first.
- Worker then submits Emergency Medical Information Form (EMIF) as normal.
- Medic sees the snapshot from that submission.
- Superuser-only reporting uses de-identified aggregates.

## Implementation strategy (recommended)
1. **Phase 1: Model + Wizard foundation**
   - Add new Medical Profile fields (optional by default unless explicitly required).
   - Add explicit emergency-contact exception path:
     - `No emergency contact` acknowledged.
   - Re-segment wizard into clearer steps:
     - Personal & Communication
     - Employment & Role
     - Emergency Contacts
     - Medical Risks & Conditions
     - Medications & Scripts
     - Immunisations
     - Consent / Save
2. **Phase 2: UX polish + conditional logic**
   - Conditional fields (business employee vs contractor).
   - Medication script prompts only for flagged meds.
   - Better in-form helper text/disclaimers for emergency use.
3. **Phase 3: Reporting**
   - Add superuser-only de-identified condition analytics on web.
   - No worker-level identifiers in report outputs.
   - Business filters + date window filters.

## Data contract (new fields to add)

### Personal / communication
- religion_cultural_considerations (text)
- interpreter_required (bool)
- interpreter_language (text)

### Employment
- is_business_employee (bool; inverse of contractor)
- employee_id (optional if business employee)
- contractor_company_name
- contractor_supervisor_name
- contractor_supervisor_phone
- contractor_supervisor_email (optional)

### Emergency contacts
- primary contact (existing fields)
- secondary contact:
  - name
  - relationship
  - phone
  - email (optional)
- no_emergency_contact_acknowledged (bool)

### Role / site context
- job_role_title
- workgroup
- roster_pattern
- permanent_room_number

### Clinical detail
- home_gp_name
- home_gp_clinic
- home_gp_phone
- allergy_reaction_notes
- normal_resting_hr
- normal_bp_systolic
- normal_bp_diastolic
- normal_bgl
- hearing_loss_history
- last_ffw_medical_date
- recent_illness_injury_hospitalisation_30d
- additional_medical_notes

### Governance / consent
- analytics_consent_deidentified (bool)
- emergency_data_sharing_consent (bool)
- profile_review_due_date (date)

## Required vs optional (initial recommendation)
- Required:
  - full name
  - DOB
  - mobile
  - communication path (`interpreter_required` + language if yes)
  - employment type (employee vs contractor)
  - site role title
  - consent checkboxes
- Optional:
  - email
  - GP details
  - secondary contact
  - room number
  - normal vitals
  - free text notes
- Conditional required:
  - employee ID if business employee
  - contractor fields if contractor
  - emergency contact details unless no-contact acknowledgment is selected

## Reporting design (superuser-only)
- Base dataset: approved snapshots/declarations per business and time period.
- Output: percentages and counts only.
- Example metrics:
  - hypertension prevalence %
  - diabetes prevalence %
  - mental-health disclosure %
  - anaphylaxis risk %
  - flagged-medication prevalence %
- Safety controls:
  - suppress very small cohorts (e.g., <5) to reduce re-identification risk.

## Technical notes
- No relational schema migration needed for most fields (JSON payload evolution).
- Keep backward compatibility by providing defaults when decoding older snapshots.
- Extend TypeScript types for new worker snapshot keys used in web detail/reporting.

## Acceptance criteria
- Worker can complete wizard with new fields and submit EMIF without regressions.
- Medic can view all relevant new data on submission detail.
- Superuser can run de-identified condition prevalence report by business.
- Existing submissions remain readable.
