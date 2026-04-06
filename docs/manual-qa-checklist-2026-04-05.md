# Manual QA Checklist

Date: 2026-04-05

## Deployment Smoke Checks

Completed in this session:

- [x] Production site responds at `https://medguard-nu.vercel.app`
- [x] `/` redirects to `/login`
- [x] `/login` returns a valid rendered HTML document
- [x] Latest production deployment completed successfully on Vercel

## Web App QA

### Anonymous access

- [ ] Visit `/`
  - Expect redirect to `/login`
- [ ] Visit `/login`
  - Expect login form, MedPass branding, email and password fields, and forgot-password action
- [ ] Attempt protected direct URLs while signed out:
  - `/medic`
  - `/admin`
  - `/superuser`
  - Expect redirect to `/login` or access denial as designed

### Role routing

- [ ] Sign in as `worker`
  - Expect no web portal access
- [ ] Sign in as `pending_medic`
  - Expect `/pending`
- [ ] Sign in as `medic`
  - Expect `/medic`
- [ ] Sign in as `admin`
  - Expect `/admin`
- [ ] Sign in as `superuser`
  - Expect `/superuser`

### Access exceptions

- [ ] Sign in with a medic account whose contract has expired
  - Expect `/expired`
- [ ] Sign in with an account in a suspended business
  - Expect `/suspended`
- [ ] Confirm suspended business users cannot enter medic/admin areas through direct URLs

### Medic declaration workflow

- [ ] Open an in-scope emergency declaration
  - Expect detail page to load
- [ ] Add a new comment
  - Expect comment to appear in order with correct author and timestamp
- [ ] Open an out-of-scope declaration as a medic
  - Expect access denied
- [ ] Review an emergency declaration
  - Expect valid transitions to save
- [ ] Try an invalid or stale review state if reproducible
  - Expect clear rejection, not silent overwrite
- [ ] Export an emergency declaration PDF
  - Expect export to succeed
- [ ] Purge only after export
  - Expect purge allowed
- [ ] Try purging an unexported declaration
  - Expect rejection

### Medication declarations

- [ ] Review an in-scope medication declaration
  - Expect review to save
- [ ] Attempt out-of-scope medication declaration review
  - Expect access denied
- [ ] Export then purge a medication declaration
  - Expect purge allowed only after export

### Fatigue assessments

- [ ] Review an in-scope fatigue assessment
  - Expect review to save and resolve
- [ ] Attempt out-of-scope fatigue review
  - Expect access denied
- [ ] Export then purge a fatigue assessment
  - Expect purge allowed only after export

### Psychosocial flows

- [ ] Review an in-scope psychosocial support check-in
  - Expect review to save
- [ ] Create a post-incident psychosocial case for an assigned site
  - Expect case creation to succeed
- [ ] Attempt post-incident case creation for an unassigned site
  - Expect access denied
- [ ] Export then purge an eligible psychosocial case
  - Expect purge allowed only after export

### Feedback and superuser settings

- [ ] Submit feedback as `medic`
  - Expect success
- [ ] Submit feedback as `admin`
  - Expect success
- [ ] Attempt feedback submission as `worker`
  - Expect rejection
- [ ] Moderate feedback as `superuser`
  - Expect update to save
- [ ] Attempt feedback moderation as non-superuser
  - Expect rejection
- [ ] Update logo, modules, reminder interval, and trial settings as `superuser`
  - Expect success
- [ ] Attempt those same settings as non-superuser
  - Expect rejection

## iOS App QA

### Upgrade-path storage checks

- [ ] Install/update onto a device or simulator that already has old local data
- [ ] Confirm saved medical profile still loads
- [ ] Confirm saved medication script images still load
- [ ] Confirm saved vital signs entries still load
- [ ] Confirm saved ECG images still load

### Worker flow

- [ ] Sign in as worker
  - Expect normal app entry
- [ ] Open and edit baseline profile
  - Expect save and reload success
- [ ] Add long-term medications and any script images
  - Expect persistence across app relaunch
- [ ] Add vital signs entry
  - Expect persistence across app relaunch
- [ ] Attach ECG image if supported in the test flow
  - Expect image to reopen correctly
- [ ] Sign out
  - Expect auth state to clear cleanly

### Access-state checks

- [ ] Sign in with suspended business account
  - Expect suspended state
- [ ] Sign in with expired medic contract
  - Expect expired/blocked state
- [ ] Restore a worker session if applicable
  - Expect worker session restore behavior only
- [ ] Restore a medic/admin/superuser session if applicable
  - Expect fresh login requirement

### Reliability checks

- [ ] Admin add/edit site flow with valid coordinates
  - Expect save success
- [ ] Admin add/edit site flow with invalid coordinates
  - Expect validation, no crash
- [ ] Medication scan flow
  - Expect parser to return candidates without crash
- [ ] Vitals log view with partial or sparse data
  - Expect no crash

## Notes

- Web automated coverage for permission and workflow guards is in place before this checklist.
- iOS automated coverage currently focuses on storage, repository persistence, parser behavior, and auth access policy.
- Existing unrelated local changes remain in both repos and were intentionally not altered during this workstream.
