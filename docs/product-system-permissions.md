# MedPass Product And Permissions Overview

## Purpose

MedPass is a dual-platform health declaration system designed to close a compliance and privacy gap in mining operations.

The product separates:

- worker data entry and field workflows on iOS
- controlled review, export, and PHI lifecycle actions on the web

This separation reduces the risk of patient health information being exported, retained, or mishandled on personal mobile devices while still allowing medics to review declarations in the field.

## Core Problem It Solves

Mining and site-based operations often need workers to declare:

- emergency medical information relevant to site access and emergency response
- new or changed medications that may affect safety, impairment risk, or drug screening outcomes

Without a structured system, organisations can end up with:

- inconsistent declaration collection
- poor auditability
- PHI being stored in uncontrolled places
- medic review happening without clear retention controls
- exported medical information living on personal devices

MedPass addresses this by:

- giving workers an iOS app to maintain their medical information and submit declarations
- giving medics a review workflow on both iOS and web
- reserving export and PHI purge for the web app only
- retaining audit-safe records after PHI is removed

## Platform Model

### iOS app

The iOS app is the field and worker application.

It supports:

- worker onboarding and sign-in
- local medical profile storage
- local vital signs logging
- emergency declaration submission
- confidential medication declaration submission
- worker history and recall workflows
- medic review workflows
- admin and superuser operational workflows

The worker role exists only on iOS.

### Web app

The web app is the controlled back-office and governed export environment.

It supports:

- medic dashboard and review workflows
- declaration and medication declaration PDF export
- post-export PHI purge
- admin operational controls
- superuser platform controls
- feedback and audit views

Workers do not use the web app.

## Role Definitions

### Worker

Platform:

- iOS only

Primary responsibilities:

- sign in and join a business
- complete and maintain a medical profile
- submit emergency medical declarations
- submit confidential medication declarations
- attach supporting prescription/script images where applicable
- view personal declaration history
- recall a declaration while it is still awaiting review

Privacy posture:

- PHI is entered and viewed by the worker on iOS
- local medical profile and local vital-sign data are scoped to the authenticated user on-device
- local data can be purged for communal/shared-device privacy
- workers do not access the web application

### Medic

Platforms:

- iOS
- web

Primary responsibilities:

- review emergency medical declarations
- review confidential medication declarations
- add comments and outcomes
- progress declarations through review states

Privacy posture:

- medics can review PHI on both platforms
- medics cannot export declarations from iOS
- PDF export and post-export purge are intentionally restricted to the web app

### Admin

Platforms:

- iOS
- web

Primary responsibilities:

- approve pending medics
- assign medics to sites
- add contractor medics
- manage medic contract end dates
- manage sites
- manage invite codes
- view business-scoped submission activity, billing context, and purge logs
- monitor declarations awaiting review so medics can be chased when safety-critical forms are sitting untouched
- search purge history by worker identity when accountability or compliance questions arise

Privacy posture:

- admins are business-scoped and should never see another business's counts, submissions, or purge history
- admins are intended to manage operational oversight and compliance tracking rather than perform clinical review
- admins may see worker name and date of birth in purge logs only, so an exported or purged record can be traced back to the responsible medic when disputes arise
- admins should not see declaration contents, medications, allergies, conditions, script images, or other clinical PHI

### Superuser

Platforms:

- iOS
- web

Primary responsibilities:

- manage the platform across businesses
- onboard businesses and admins
- review platform metrics and business summaries
- suspend and unsuspend businesses
- manage reminder intervals, feature toggles, branding, and trial settings
- review platform feedback

Privacy posture:

- superusers are intended to operate on business and platform metadata
- superuser flows are designed to avoid PHI exposure

## Key Workflows

### 1. Worker onboarding and profile setup

The worker signs in on iOS, joins a business via invite code, and completes a profile wizard that captures:

- personal details
- emergency contact details
- allergies and anaphylaxis risk
- ongoing medications
- medical conditions
- privacy and save preferences

This medical profile becomes the baseline for future declarations.

### 2. Emergency medical declaration workflow

The worker submits an emergency medical declaration on iOS.

The declaration draws from the saved worker profile and includes:

- worker and emergency contact information
- site and shift context
- declared medications
- declared conditions
- supporting prescription/script uploads where relevant

Medics review these declarations on iOS or web.

The declaration can move through statuses such as:

- New
- In Review
- Approved
- Requires Follow-up
- Recalled

### 3. Confidential medication declaration workflow

The worker submits a confidential medication declaration on iOS when they are taking a new or newly relevant medication.

This workflow is more targeted than the emergency declaration flow and is designed for:

- short-term medications such as pain relief or antibiotics
- newly prescribed long-term medications
- medications with side-effect or drug-screen implications

Supporting script images can be captured and attached for flagged medications.

Medics review these declarations on iOS or web.

### 4. Recall workflow

Workers can recall an emergency declaration while it is still awaiting review.

The intent is:

- the medic should not continue working from an outdated or withdrawn declaration
- the system should preserve an audit-friendly trail without treating the declaration as an active queue item

The iOS app also contains offline recall queue handling so recalls can be queued when connectivity is unavailable.

### 5. Export and PHI purge workflow

This is the core privacy boundary in the system.

Medics can review declarations on mobile, but export is intentionally not available there.

On the web app:

- a medic exports a declaration to PDF
- once export has occurred, PHI can be purged
- the system retains an audit-safe shell of the record
- purge actions are logged in a purge audit log

After purge:

- live PHI is removed
- decision and audit context remain
- the record is treated as archived

This design reduces the risk of PHI being exported or retained on personal mobile devices.

## Privacy And Compliance Model

### Main design principles

1. Workers enter PHI on iOS, where the workflow is closest to the person and event.
2. Review can happen on iOS or web for operational flexibility.
3. Export is restricted to the web app to avoid PHI export from personal devices.
4. Purge follows export so the PHI retention window is limited.
5. Audit-safe metadata survives after PHI is removed.
6. Admin oversight is limited to business-scoped operational metadata, with worker name and date of birth visible only in purge-log lookup flows.
7. Superuser and platform management functions avoid PHI where possible.

### Admin visibility policy

Admins may see:

- business-scoped submission counts and workflow status
- business-scoped site breakdowns and stale-review indicators
- purge and export audit chains
- worker name and date of birth in purge-log search results for compliance and dispute resolution

Admins may not see:

- declaration body content
- worker medical profile details
- medications, allergies, or conditions
- emergency contact details
- prescription or script uploads
- other clinical PHI beyond the limited purge-log identity fields above

### Shared-device privacy protections

The iOS app includes explicit protections for shared or communal devices:

- per-user local profile scoping
- local vital-sign data scoped to the authenticated user
- deletion of local data when sign-out occurs if the worker has not opted to retain it
- ability to purge locally stored profile data for communal-device privacy

### Archival model

The product distinguishes between:

- active declarations containing PHI
- exported declarations
- archived declarations where PHI has been removed but operational history remains

This supports operational review while reducing long-term exposure.

## Platform Capability Matrix

| Capability | Worker iOS | Worker Web | Medic iOS | Medic Web | Admin iOS | Admin Web | Superuser iOS | Superuser Web |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sign in | Yes | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Account settings | Yes | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Complete medical profile | Yes | No | No | No | No | No | No | No |
| Store local PHI on device | Yes | No | Limited app state only | No | No | No | No | No |
| Log vital signs | Yes | No | No | No | No | No | No | No |
| Join business via invite code | Yes | No | Registration flow exists | No direct web flow identified | No | No | No | No |
| Submit emergency declaration | Yes | No | No | No | No | No | No | No |
| Submit medication declaration | Yes | No | No | No | No | No | No | No |
| Upload prescription/script images | Yes | No | View only in review context | View/export context only | No | No | No | No |
| View own declaration history | Yes | No | No | No | No | No | No | No |
| Recall own new declaration | Yes | No | No | No | No | No | No | No |
| Review emergency declarations | No | No | Yes | Yes | No, oversight only | No, oversight only | No | No |
| Review medication declarations | No | No | Yes | Yes | No, oversight only | No, oversight only | No | No |
| Add or edit medic comments | No | No | Yes | Yes | No | No | No | No |
| Mark in review / approve / follow-up | No | No | Yes | Yes | Not intended | No | No | No |
| Export declarations to PDF | No | No | No | Yes | No | Not identified | No | No |
| Purge PHI after export | No | No | No | Yes | No direct purge action identified | Purge log only | No | No |
| See archived post-purge record | History shows archived state | No | Yes | Yes | Via purge log / operational views | Via purge log / operational views | Via audit-level views | Via audit-level views |
| Approve pending medics | No | No | No | No | Yes | Yes | Possibly through business detail flows | Yes |
| Assign medic site access | No | No | No | No | Yes | Yes | Possibly | Yes |
| Add contractor medics | No | No | No | No | Yes | Yes | Possibly via business management | Yes |
| Manage sites | No | No | No | No | Yes | Yes | Possibly | Business-level visibility |
| Manage invite codes | No | No | No | No | Yes | Yes | No | No |
| View billing / monthly counts | No | No | No | Limited | Yes | Yes | Yes | Yes |
| View purge audit log | No | No | No | No | Yes | Yes | Yes | Yes |
| Manage reminder intervals / feature toggles / trial settings | No | No | No | No | Limited | Limited | Yes | Yes |
| Suspend or unsuspend business | No | No | No | No | No | No | Yes | Yes |
| Platform feedback review | Submit only | Submit / review split | Submit only | Submit only | Submit only | Submit only | Yes | Yes |

## Architectural Interpretation

The current system should be understood as:

- iOS is the worker and field operations application
- web is the governed review, export, and operational control application
- workers do not require web access
- medics review on both platforms but export on web only
- admins manage access and operations
- superusers manage the platform without needing patient-level visibility

This is not a simple duplicated mobile and web app.

It is a deliberately split architecture where the two platforms play different privacy and governance roles.

## Current Caveats And Notes

### 1. The two platforms are not exact mirrors

They mirror core business concepts, but platform scope differs by design:

- worker flows are iOS-only
- export and purge are web-only
- admin oversight should be consistent across iOS and web, but without declaration-content access

### 2. Admin scope should be reviewed for consistency

The intended admin policy is business-scoped operational oversight on both iOS and web.

Admins should be able to:

- see submission counts and workflow status for their own business
- see site-level operational breakdowns for their own business
- search purge logs by worker name and date of birth for compliance accountability

Admins should not be able to:

- open declaration contents
- read worker clinical details
- access medication payloads or script uploads

### 3. Security and tenancy checks are critical where service-role operations exist

Wherever the system uses privileged backend operations to review, export, or purge declarations, route-level tenancy checks must remain strict so a user can act only within:

- their business
- their assigned site scope

## Recommended Internal Use Of This Document

This document can be used for:

- onboarding engineers and product collaborators
- explaining the role model to operations or compliance stakeholders
- supporting privacy-by-design discussions
- preparing customer-facing or investor-facing summaries
- documenting why export is intentionally web-only

## Short Summary

MedPass is a mining-sector compliance and privacy workflow split across iOS and web.

Workers use iOS to maintain their medical information and submit declarations.
Medics review on iOS or web.
Export and PHI purge happen on web only.
Admins control business-scoped operational access, submission oversight, and purge accountability without clinical visibility.
Superusers manage the platform without needing PHI.

That split is the core design decision that closes the privacy gap the product is targeting.
