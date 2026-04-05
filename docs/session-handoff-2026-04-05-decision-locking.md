# Decision Locking Follow-Up

## Context

During production QA we confirmed the intended policy:

- once a medic sets a final outcome, the outcome must not change
- comments must remain available after the outcome is set
- exported records must remain re-exportable until they are purged

## Changes Made

- emergency declaration final outcomes are now treated as terminal in shared review guards
- emergency declaration detail UI no longer offers decision-changing actions after `Approved` or `Requires Follow-up`
- emergency declaration outcome updates now go through the protected review API instead of direct client-side Supabase writes
- medication declaration review route now blocks changing one final outcome into another, while still allowing comment-only saves when the outcome stays the same
- medication declaration detail UI disables outcome controls once a final outcome exists, keeps comments editable, and keeps PDF re-export available

## Files Updated

- `lib/review-guards.ts`
- `lib/__tests__/review-guards.test.ts`
- `lib/medication-review-guards.ts`
- `lib/__tests__/medication-review-guards.test.ts`
- `app/api/medication-declarations/[id]/review/route.ts`
- `components/medic/SubmissionDetail.tsx`
- `components/medic/MedDecDetail.tsx`

## Verification

- `npm test` passed: 9 files, 57 tests
- `npm run build` passed

## QA Impact

After deployment, production QA should confirm:

- emergency records with `Approved` or `Requires Follow-up` do not show decision-changing buttons
- medication declarations with `Normal Duties`, `Restricted Duties`, or `Unfit for Work` do not allow changing the selected outcome
- medication declarations with a locked outcome still allow comment updates
- exported records still show `Download PDF Again`
