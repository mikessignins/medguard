# Psychosocial Module Handoff - 2026-04-03

## Current Direction

The psychosocial module has been deliberately reshaped into **two distinct worker pathways** under the same broader module umbrella:

1. `Wellbeing Pulse`
2. `Support Check-In`

This split is intentional and should be preserved.

### Wellbeing Pulse

- Worker can submit on a business-defined cadence and anytime they want.
- This flow is for **de-identified business metrics only**.
- It should **not** create a medic review case by default.
- It should feed superuser/business reporting across the recognised psychosocial hazard groups.

### Support Check-In

- Worker can submit when they want support, follow-up, or contact.
- This flow is **worker-identifiable** and should go to medic/welfare review.
- It should still contribute to **grouped de-identified reporting** in aggregate.
- This is the current worker-facing psychosocial flow already wired in iOS.

## Key Product Rule

The support-to-medic pathway must also feed de-identified reporting.

That means psychosocial reporting should aggregate from:

- de-identified `Wellbeing Pulse` submissions
- identifiable `Support Check-In` submissions, but only after de-identification and grouping

## Recognised Psychosocial Hazard Groups

The reporting model should align with the recognised psychosocial hazards the user listed:

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

### Additional

- Fatigue
- Intrusive surveillance

## What Has Been Updated

### Web

Updated in `/Volumes/1tbusb/MedM8_WebApp`:

- [docs/psychosocial-module-spec.md](/Volumes/1tbusb/MedM8_WebApp/docs/psychosocial-module-spec.md)
- [docs/migrations/026_seed_psychosocial_module.sql](/Volumes/1tbusb/MedM8_WebApp/docs/migrations/026_seed_psychosocial_module.sql)
- [lib/modules.ts](/Volumes/1tbusb/MedM8_WebApp/lib/modules.ts)

The web foundation now describes a dual-track psychosocial model instead of a single pulse-with-review path.

### iOS

Updated in `/Volumes/1tbusb/xcode/meddec`:

- `/Volumes/1tbusb/xcode/meddec/meddec/Domain/Models.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Domain/Repositories.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseModuleSubmissionRepository.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/PsychosocialPulseView.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/PsychosocialPulseViewModel.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeView.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHistoryView.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerSideMenuView.swift`

The current iOS worker psychosocial flow has been repurposed to behave as the **Support Check-In** path.

## Build Status At Handoff

### Web

Command:

```bash
npm run build
```

Result:

- Passed on 2026-04-03

### iOS

Command:

```bash
xcodebuild -project /Volumes/1tbusb/xcode/meddec/meddec.xcodeproj -scheme meddec -destination 'generic/platform=iOS Simulator' build
```

Result:

- Passed on 2026-04-03

## Important Current State

- The current iOS psychosocial worker flow is **not yet** the de-identified `Wellbeing Pulse`.
- It is now the actionable `Support Check-In`.
- The separate lightweight `Wellbeing Pulse` still needs to be built.

## Recommended Next Steps

1. Build the separate worker `Wellbeing Pulse` flow in iOS.
2. Keep that pulse flow de-identified and non-review by default.
3. Add reminder scheduling based on business module config.
4. Build the medic/welfare review path for `Support Check-In`.
5. Build superuser reporting that aggregates both tracks into recognised psychosocial hazard groups.
6. Add governance/export/purge rules for reviewed `Support Check-In` cases.

## Do Not Lose

The user's preferred architecture is:

- routine psychosocial check-ins for metrics only
- separate support request flow for action/case management
- both flows contribute to de-identified business/superuser reporting

That split is a core product decision, not just a UI preference.
