# Psychosocial Umbrella Go-Live Checklist

Use this checklist when activating `psychosocial_health` for a pilot business and testing the full worker, medic, and superuser flow.

## 1. Environment Readiness

- Confirm `026_seed_psychosocial_module.sql` has been applied in the target environment.
- Confirm `027_psychosocial_deidentified_reporting.sql` has been applied in the target environment.
- Confirm target business rows exist in `business_modules` for `psychosocial_health`.
- Confirm the target business has at least one worker account and one medic account assigned to a site.

## 2. Web Activation

- Open the superuser business page for the pilot business.
- Enable the `Psychosocial Health & Wellbeing` module from the module toggle area.
- Confirm the toggle persists after refresh.
- Confirm the target business row in `business_modules` shows `enabled = true`.

## 3. iOS Worker Flow Test

### Wellbeing Pulse

- Log in as a worker in the iOS app.
- Confirm the worker dashboard shows a launch path for `Wellbeing Pulse`.
- Submit a low-risk pulse.
- Confirm it appears in worker history/dashboard as a psychosocial item.
- Confirm it does **not** appear in the iOS medic queue.
- Confirm it does **not** appear in the web medic psychosocial queue.

### Support Check-In

- From the iOS worker dashboard, open `Support Check-In`.
- Submit a support request with a clear review/follow-up signal.
- Confirm it appears in worker history/dashboard as awaiting review.
- Confirm it appears in the iOS medic queue.
- Confirm it appears in the web medic psychosocial queue.

## 4. iOS Medic Flow Test

- Log in as a medic assigned to the same site in the iOS app.
- Open the site queue and confirm psychosocial cases appear under the psychosocial section.
- Confirm only `Support Check-In` and `Post-Incident Welfare` appear there.
- Open the support check-in case.
- Confirm the medic can record:
  - Priority
  - Review path
  - Contact outcome
  - Referrals
  - Follow-up dates
  - Outcome summary and notes
- Save once as `Awaiting Follow-Up`.
- Re-open and save as `Resolved`.
- Confirm worker-facing status updates accordingly in the iOS worker app.

## 5. Web Medic Dashboard Test

- Open `/medic/psychosocial`.
- Confirm the same support check-in appears there.
- Open the case detail page.
- Confirm status and review details match the iOS medic review.
- Export the resolved case PDF.
- Confirm the export is listed in `/medic/exports`.
- Confirm manual purge is available only for export-eligible identifiable psychosocial cases.
- Confirm `Wellbeing Pulse` does not appear in exports.

## 6. Post-Incident Welfare Test

- In the web medic dashboard, open `/medic/psychosocial/post-incident`.
- Create a post-incident welfare case for a pilot worker.
- Confirm it appears in the iOS medic queue.
- Open it in the iOS medic app and complete review details.
- Confirm the case can be left as `Awaiting Follow-Up` or `Resolved`.
- Confirm export and purge remain web-only.

## 7. Superuser Reporting Test

- Open `/superuser/reports`.
- Pull a report for the pilot business and site.
- Confirm psychosocial reporting renders without error.
- Confirm counts aggregate across:
  - `Wellbeing Pulse`
  - `Support Check-In`
  - `Post-Incident Welfare`
- Confirm no worker names, free-text notes, or case-level identifiers are shown.
- Confirm suppression works for small cohorts.

## 8. Retention and Purge Test

- Export a resolved psychosocial support case.
- Confirm purge can be triggered manually from the web medic exports flow.
- Confirm purge clears identifiable PHI from the psychosocial submission row.
- Confirm the purge audit log records the purge event.
- Confirm the cron-based purge path still works for expired retained exports.

## 9. Pilot Sign-Off

- Workers can submit pulse and support flows without errors.
- Medics can review actionable psychosocial cases on iOS.
- Medics can export and purge reviewed identifiable psychosocial cases on the web.
- Superusers can run de-identified psychosocial reporting without row-level PHI exposure.
- The target business confirms the privacy contract:
  - `Wellbeing Pulse` = de-identified metrics only
  - `Support Check-In` = identifiable case management + de-identified aggregate reporting
  - `Post-Incident Welfare` = identifiable case management + de-identified aggregate reporting
