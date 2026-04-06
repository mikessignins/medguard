# Manual QA Results

Date: 2026-04-05
Environment: Production web app on Vercel
URL: `https://medguard-nu.vercel.app`

## Verified

### Deployment smoke

- `/` redirects to `/login`
- `/login` renders correctly
- Production deployment is live and serving the expected app shell

### Role routing with provided credentials

- `worker` (`pat3@fullarton.app`)
  - Result: stays on `/login`
  - Message: `This account type does not have web portal access.`
- `medic` (`medic3@fullarton.app`)
  - Result: lands on `/medic/emergency`
- `pending_medic` (`medic6@fullarton.app`)
  - Result: lands on `/pending`
- expired medic (`medic123@gmail.com`)
  - Result: lands on `/expired`
- `admin` (`admin2@fullarton.app`)
  - Result: lands on `/admin`
- `superuser` (`mikessignins@gmail.com`)
  - Result: lands on `/superuser`
- suspended-business account (`Lf@gmail.com`)
  - Result: lands on `/suspended`

### Cross-role protected URL checks

- signed-in `medic` visiting `/admin`
  - Result: bounced back to `/medic/emergency`
- signed-in `admin` visiting `/superuser`
  - Result: bounced back to `/admin`
- signed-in `admin` visiting `/medic`
  - Result: bounced back to `/admin`

### Detail page state checks

- emergency declaration `D42FE3F0-62A1-464E-AB26-1B3601E10890`
  - Result: detail page loads for medic
  - Status shown: `In Review`
  - Actions visible: `Approve`, `Requires Follow-up`, `Export PDF`, `Post Comment`

- emergency declaration `14851D70-B51A-49D1-9D5E-00DE2CEC8734`
  - Result: detail page loads for medic
  - Status shown: `Requires Follow-up`
  - Export state shown: exported
  - Actions visible: `Approve`, `Update Follow-up Note`, `Download PDF Again`, `Post Comment`

- medication declaration `5E8EFA30-F77C-4A26-9DDA-61B5D8E956B1`
  - Result: detail page loads for medic
  - Status shown: `In Review`
  - Export state shown: not yet exported
  - Actions visible: `Normal Duties`, `Restricted Duties`, `Unfit for Work`, `Save Review`, `Export PDF`

- medication declaration `5D231A1B-38B8-40F6-BF14-42CD1BBEBD37`
  - Result: detail page loads for medic
  - Status shown: `Restricted Duties`
  - Export state shown: exported
  - Actions visible: `Normal Duties`, `Restricted Duties`, `Unfit for Work`, `Save Review`, `Download PDF Again`

## Not Yet Verified

### Missing credentials / context

- known submission/test record IDs for:
  - declaration comment/review/export/purge
  - medication declaration review/export/purge
  - fatigue review/export/purge
  - psychosocial review/export/purge

### iOS

- upgrade-path validation with existing on-device data
- local persistence and migration checks on a device/simulator with prior saved files
- sign-in and blocked-state checks in the production app

## Current Readout

The production web role-routing behavior for the supplied accounts matches expectations:

- worker blocked from web portal
- medic routed into medic portal
- pending medic routed to pending state
- expired medic routed to expired state
- admin routed into admin portal
- superuser routed into superuser portal
- suspended business account routed into suspended state

The web app also correctly resists several direct cross-role URL attempts after sign-in.

One follow-up question from the read-only detail checks:

- exported/reviewed emergency and medication declaration screens still expose some editable actions
- this may be intentional, but it is worth confirming whether post-export review edits are allowed by policy
