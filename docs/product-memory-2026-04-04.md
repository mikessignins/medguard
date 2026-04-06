# Product Memory - 2026-04-04

This document captures the current shared understanding of the psychosocial umbrella module, related iOS/web workflows, worker dashboard UX changes, site contact handling, and the next planned reminder work.

It is intended to be a durable handoff/reference file so we can resume work without relying on chat history.

## Repos

- Web app: `/Volumes/1tbusb/MedM8_WebApp`
- iOS app: `/Volumes/1tbusb/xcode/meddec`

## Core Psychosocial Product Model

The umbrella module is `Psychological Health & Psychosocial Risk`.

It currently has three workflows under the same umbrella:

1. `Wellbeing Pulse`
   - Worker-facing
   - Regular or anytime check-in
   - Metrics only
   - De-identified for reporting
   - Does not create a medic review case

2. `Support Check-In`
   - Worker-facing
   - Worker asks for support/contact
   - Identifiable
   - Reviewable/actionable by medic or welfare
   - Still contributes to de-identified aggregate reporting

3. `Post-Incident Psychological Welfare`
   - Medic-led identifiable workflow
   - Used for structured follow-up after an incident
   - Export/purge handled on web
   - Also contributes only as grouped de-identified reporting at the superuser/business level

This split is intentional and should remain the core privacy/operational boundary:

- `Wellbeing Pulse` = metrics
- `Support Check-In` = case workflow
- `Post-Incident Psychological Welfare` = advanced case workflow

## Hazard Model

The psychosocial design is intended to collect signals across the 17 recognised psychosocial hazard groups:

### Work Design & Organisation

- High job demands
- Low job demands
- Low job control
- Poor support
- Lack of role clarity
- Poor organisational change management
- Poor organisational justice
- Low reward and recognition
- Job insecurity

### Workplace Behaviours & Interactions

- Violence and aggression
- Bullying
- Harassment including sexual harassment

### Environmental & Situational

- Remote or isolated work
- Poor physical environment
- Traumatic events or material

### Additional Commonwealth / Comcare Additions

- Fatigue
- Intrusive surveillance

Both `Wellbeing Pulse` and `Support Check-In` should continue using compatible hazard-question backbones so reporting can aggregate across both workflows.

## Privacy Boundary

The agreed privacy model is:

- Workers submit `Wellbeing Pulse` without creating an identifiable review case.
- Workers submit `Support Check-In` when they want follow-up.
- Medics can see identifiable support and post-incident case data.
- Superusers and businesses must only ever see de-identified aggregate reporting.

Important implementation decision:

- Superuser psychosocial reporting should not just hide identifiers in the UI.
- It should be aggregate-only at the database boundary.

This was addressed with:

- `docs/migrations/027_psychosocial_deidentified_reporting.sql`

The suppression threshold is:

- minimum cohort of `5` distinct workers in the filtered cohort
- not `5` submissions

## Current Web Responsibilities

### Medic Web Dashboard

The medic web dashboard is the place for advanced psychosocial case handling, including:

- psychosocial queue/detail views
- post-incident welfare creation
- export of reviewed psychosocial cases
- manual purge
- auto purge after retention window

Operational rule:

- iOS medic can review up to the simpler mobile review states
- advanced post-incident handling, export, and purge stay web-only

### Superuser Web Reporting

The superuser reporting surface should:

- combine de-identified data from `Wellbeing Pulse`, `Support Check-In`, and post-incident welfare
- roll up by recognised psychosocial hazard groups
- never expose worker-identifiable detail

### Module Activation

The psychosocial umbrella was moved toward live/activatable state for pilot testing.

## Current iOS Responsibilities

### Worker iOS

Workers should be able to:

- submit `Wellbeing Pulse`
- submit `Support Check-In`
- see current site contacts
- call available site contacts with one tap

The worker psychosocial experience has now moved well beyond a simple form.

Current `Wellbeing Pulse` direction:

- step-by-step conversational flow rather than one long form
- time-of-day greeting with worker first name
- empathetic, validating language across all response levels
- one-question-per-step structure
- 6-step flow rather than 1 long structured screen
- profile/site/roster context is attached in the background rather than shown as editable form fields
- `submissionContext` is chosen at the final step before send
- each step should validate the previous step's answers in a short supportive summary
- the final step should give a short human summary before send

Current worker psychosocial UX rules:

- show the site medic number clearly as `Site medic: <number>` when available
- use one-tap call for the site medic number on iOS
- keep the risk/result summary at the bottom/final stage rather than near the top
- if result is above low, guide the worker toward medic contact and/or `Support Check-In`
- avoid heavy reporting/governance language at the top of the pulse
- move privacy/reporting explanation toward the final confirmation area
- disable swipe-to-dismiss for psychosocial sheets
- provide a bottom-left `Cancel` action with discard confirmation so exit is intentional but available on every step

### Medic iOS

The medic iOS dashboard should:

- show actionable psychosocial items only
- exclude `Wellbeing Pulse`
- allow mobile review of `Support Check-In`
- show the worker phone number as tappable for direct call from the mobile app

Important agreed boundary:

- medic direct calling should happen from the mobile app, not web
- advanced case-management work remains on the web dashboard

## Psychosocial Review / Case Management Direction

The psychosocial review flow needs to feel operational, not generic.

Agreed improvements:

- comments/notes should be append-only and immutable once saved
- mobile review should use structured action outcomes instead of a generic save
- all psychosocial support cases imply further follow-up

Desired mobile action patterns include:

- contacted patient
- in-person review arranged
- referred to site counsellor
- referred to other medical professional

Mobile should support first-step actioning.
Web should support the fuller case-management lifecycle.

## Worker Dashboard Refactor

The worker home dashboard was refactored because the old layout became cluttered once workers had multiple submissions and statuses.

### New Intended Information Hierarchy

1. `Quick Actions`
   - primary place to start forms

2. `Needs Attention`
   - active/review/follow-up items
   - includes recall path for recallable declarations

3. `Current Site`
   - support contacts
   - view contacts
   - change site

4. `Recent Activity`
   - short preview only
   - full detail belongs in history

### Navigation Rule

The dashboard is the primary place to start forms.

The worker side menu should focus on utilities such as:

- medical profile
- site information
- account/settings
- join business
- feedback
- sign out

It should not duplicate the full form-launch stack if `Quick Actions` already exists on the dashboard.

### Important Recall Requirement

One issue discovered during the refactor:

- workers must still be able to easily recall a declaration that is awaiting review when they need to correct something

That recall affordance needs to remain obvious in the `Needs Attention` section.

Latest dashboard/recall refinement:

- recall was not actually broken, but it was being pushed out of the preview because `Needs Attention` only showed a limited number of cards
- recallable emergency declarations now need to be pinned high enough in `Needs Attention` that the `Recall Declaration` action is reliably visible
- side menu form duplication was intentionally reduced so the dashboard stays the primary launch surface

## Site Contact Model

Site contact numbers are optional because some sites are offices/admin locations and will not have all roles.

Optional site numbers now include:

- medic phone
- EAP number
- ESO number
- site safety manager number
- village admin number

These should:

- be entered by admin in web and iOS admin dashboards
- appear in the worker site information view when present
- support one-tap calling on iOS

UX correction already identified:

- phone-number fields in admin editors must be labeled as numbers, not names

Examples:

- `Emergency Services Officer (ESO) Number`
- `Site Safety Manager Number`
- `Village Admin Number`

## Worker Psychosocial Copy Direction

### Wellbeing Pulse

The older trust-copy block has largely been superseded by a conversational design.

Current preferred `Wellbeing Pulse` tone:

- warm and human, not clinical
- conversational, not obviously “reporting system” language
- validating across all response paths, not just low mood
- supportive summaries between steps
- privacy explanation present but not front-loaded
- repeated wording should be avoided where possible

Current preferred conversational pattern:

1. greeting header:
   - `Good morning, <name>.`
2. first question:
   - `How are you feeling today, <name>?`
3. low/mixed/good/great branches should each get their own acknowledgement
4. each new step should briefly validate the previous step's answers
5. step 6 should read like a coherent close-out:
   - pulse reason / context
   - short summary before send
   - result interpretation
   - reassuring support line
   - confirmation
   - concise privacy note

Important current preference:

- avoid repeating summary text from the bottom of one step at the top of the next
- all response paths, including calm/steady ones, should still receive a validating summary
- avoid awkward repeated words in adjacent summary lines
- avoid showing admin/profile context as visible fields inside the pulse if it already exists in worker/site data

### Support Check-In

Preferred worker-facing wording:

> Use this form if you would like support from the medic or welfare team.  
> This check-in will be reviewed so someone can follow up with you.  
> If you ask for contact, a medic or welfare lead may contact you directly.  
> De-identified trends may still be included in workforce reporting, but your personal details are never shown to your employer.  
> If you are in crisis or this is an emergency call the site medic on `<number>`.

The medic number should be pulled from site information when available.

## Current iOS Repo Status

The current iOS work has been pushed to the GitHub repo:

- Repo: `https://github.com/mikessignins/MedGuardApp`
- Branch: `main`
- Commit pushed: `3b6e1a5`
- Commit message: `Refine worker dashboard and psychosocial iOS flows`

## Reminder / Notification Direction

The app currently uses local iOS notifications rather than backend remote push.

Planned reminder model:

1. `Medical Profile Review Reminder`
   - business-configured interval
   - prompts worker to review/update medical profile and declaration

2. `Wellbeing Pulse Reminder`
   - business-configured interval
   - prompts worker to complete a psychosocial pulse at a regular cadence

This is intended to create:

- better medical/declaration currency
- a steady stream of de-identified psychosocial metrics for businesses

Design intent:

- reminders are separate
- pulse cadence should likely use days or named cadence such as weekly / fortnightly / monthly
- support check-in is not a scheduled reminder flow

## Key Existing Docs

- `/Volumes/1tbusb/MedM8_WebApp/docs/psychosocial-module-spec.md`
- `/Volumes/1tbusb/MedM8_WebApp/docs/psychosocial-module-handoff-2026-04-03.md`
- `/Volumes/1tbusb/MedM8_WebApp/docs/psychosocial-go-live-checklist.md`
- `/Volumes/1tbusb/MedM8_WebApp/docs/migrations/026_seed_psychosocial_module.sql`
- `/Volumes/1tbusb/MedM8_WebApp/docs/migrations/027_psychosocial_deidentified_reporting.sql`
- `/Volumes/1tbusb/MedM8_WebApp/docs/migrations/028_add_site_eap_phone.sql`

## Current Open Next Steps

### High Priority

1. Implement business-configurable reminder settings for:
   - medical profile review
   - wellbeing pulse cadence

2. Wire iOS scheduling for both local reminder streams.

3. Keep refining worker psychosocial trust UX and medic action UX based on device testing.

4. Continue end-to-end pilot testing across:
   - worker iOS
   - medic iOS
   - medic web dashboard
   - superuser web reporting

### Operational/UX Follow-Up

1. Make sure medic mobile review remains clearly bounded to first-step actions only.
2. Keep post-incident welfare, export, and purge web-only.
3. Maintain append-only psychosocial note history.
4. Preserve easy worker recall of pending declarations from home/dashboard.

## Intent of This File

This file should be updated whenever there is a meaningful shift in:

- psychosocial workflow boundaries
- privacy rules
- worker/medic responsibilities across iOS and web
- site contact model
- reminder cadence/config behavior
- worker dashboard information architecture

It is the current "persistent memory" snapshot as of `2026-04-04`.
