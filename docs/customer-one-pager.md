# MedPass One-Pager

## What MedPass Does

MedPass helps mining and site-based organisations manage worker medical declarations in a way that is safer, more auditable, and more privacy-conscious than informal paper, email, or chat-based processes.

It gives workers a secure mobile workflow to complete and update their medical information, and gives site medics and operators the tools they need to review declarations without exposing patient health information unnecessarily.

## The Problem

In many mining environments, medical declarations are operationally important but difficult to manage well.

Common challenges include:

- inconsistent declaration collection across sites and rosters
- limited auditability of who submitted, reviewed, or actioned a declaration
- sensitive health information being stored in uncontrolled places
- medic review happening on personal devices without strong governance
- exported health information living longer than needed

## The MedPass Approach

MedPass splits the workflow across mobile and web on purpose.

### Worker experience on iPhone

Workers use the iOS app to:

- sign in and join their organisation
- complete a personal medical profile
- submit emergency medical declarations
- submit confidential medication declarations
- attach supporting prescription images where needed
- review their own declaration history

Workers do not need web access.

### Medic and operator experience

Medics can review declarations on mobile or web, but export is restricted to the web application.

That means:

- field review stays practical
- sensitive health information is not exported from personal phones
- PDF generation and retention-sensitive actions happen in a more controlled environment

## Why This Matters

The core design principle behind MedPass is simple:

collect and review the information where it is operationally useful, but restrict export and long-term handling to the environment best suited for governance.

This helps organisations reduce privacy risk while still keeping medical workflows workable in the field.

## Key Benefits

### Better privacy control

- worker health information is not treated like a general admin document
- export is intentionally removed from the mobile medic workflow
- post-export PHI purge supports tighter retention control

### Better operational readiness

- declarations are site-aware and role-aware
- medics can review submissions by assigned site
- workers can update and submit information from the field

### Better auditability

- declarations move through defined review states
- audit-safe records remain after PHI is purged
- purge activity is logged for traceability

### Better support for mining-specific workflows

- worker medical profile and declaration flows are built around site access and safety decisions
- confidential medication declarations support impairment and drug-screen-related disclosures
- contractor and multi-site workflows are supported

## Typical Workflow

1. A worker maintains their medical profile in the iOS app.
2. Before site access or after a relevant change, they submit a declaration.
3. A site medic reviews the declaration on iOS or web.
4. If a formal export is required, it is generated on the web app only.
5. Once export has occurred, PHI can be purged while preserving an audit-safe record.

## Who Uses MedPass

### Workers

Use the iOS app to manage and submit personal medical information.

### Medics

Review declarations and action outcomes, with export controlled through the web platform.

### Admins

Manage sites, invite codes, and medic access.

### Platform owners

Manage businesses, onboarding, and platform-level governance without needing patient-level detail.

## What Makes MedPass Different

MedPass is not just a mobile form app and not just a web admin portal.

It is a deliberately split workflow designed around a privacy boundary:

- worker entry on mobile
- medic review on mobile and web
- export and PHI lifecycle control on web only

That makes it especially well suited to industries like mining, where operational practicality and privacy governance both matter.

