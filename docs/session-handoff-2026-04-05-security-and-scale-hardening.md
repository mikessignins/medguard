# Session Handoff: Security And Scale Hardening

Date: 2026-04-06

## Scope

This session focused on closing pre-production hardening gaps called out in the review notes across the MedM8 web app and companion iOS app.

Completed phases:

1. iOS Supabase configuration was moved out of Swift source and then out of committed plist literals into build-setting injection.
2. iOS offline recall queue storage was moved off plain `UserDefaults` into the protected local PHI storage path.
3. Web API write routes gained shared Zod request validation.
4. Web route-level error boundaries were added to contain crashes.
5. Supabase RLS was tightened so expired medic contracts are enforced at the database boundary, not just on the iOS client.
6. Large web admin and superuser list views were changed toward paginated or aggregated server-side access patterns.
7. Psychosocial scoring ownership was moved toward the server so stored thresholds no longer depend on the iOS client.
8. A shared observability foundation was added across web and iOS using a Supabase-backed event log.
9. Cross-app module registry drift was reduced by aligning iOS module readiness metadata with the web app for psychosocial visibility.
10. Web JSON body parsing migration was completed across all API routes and sensitive write/export flows gained DB-backed rate limiting.
11. Item 4 advanced further with dedicated psychosocial conversation sections and extracted worker dashboard active cards.
12. iOS automated coverage was expanded for worker-home helper logic, recall flows, and the fatigue and psychosocial worker view models.

## Key Changes

### iOS app

- `SupabaseService` now reads configuration from `Info.plist` instead of hardcoded literals in Swift.
- `Info.plist` now resolves Supabase values from build settings:
  - `$(SUPABASE_URL)`
  - `$(SUPABASE_ANON_KEY)`
- Added config structure for local secret injection:
  - `meddec/Configs/Meddec.xcconfig`
  - `meddec/Configs/MeddecSecrets.example.xcconfig`
  - ignored local file `meddec/Configs/MeddecSecrets.local.xcconfig`
- Added `SECURITY_MEMORY.md` in the iOS repo documenting anon key rotation and how to update the app after rotation.
- Important xcconfig syntax note:
  - `SUPABASE_URL` cannot be written as a raw `https://...` value in `.xcconfig` because `//` is treated as a comment.
  - The working format is `https:/$()/your-project.supabase.co`.
- `SupabaseService` now validates malformed or unresolved config values more defensively so bad xcconfig expansion fails with a clear app config error instead of a deeper SDK crash.
- `PendingRecallQueue` now persists through protected storage rather than plain `UserDefaults`, with migration coverage for legacy data.
- iOS module readiness metadata was aligned with the web app so psychosocial now shows as active/live in the superuser dashboard instead of future/planned.
- `WorkerHomeView.swift` has started to be decomposed by extracting shared dashboard presentation into `WorkerHomeDashboardComponents.swift`.
- Subsequent refactor passes extracted dedicated dashboard sections for:
  - current site / support contacts
  - recent activity
  - quick actions
  - needs attention
- `PsychosocialPulseView.swift` was decomposed into an orchestration shell plus dedicated conversational step views in `PsychosocialPulseConversationSections.swift`.
- `WorkerHomeView.swift` now delegates the four active submission cards into `WorkerHomeActiveCards.swift`, leaving the parent view more focused on dashboard orchestration.
- Dashboard model-building logic for attention, recent activity, and quick actions now lives in `WorkerHomeDashboardState.swift`, reducing the amount of state-shaping work embedded in `WorkerHomeView.swift`.
- Worker-home lifecycle loading now uses `WorkerHomeLifecycle.swift` for dashboard snapshot loading, enabled-module loading, and initial site resolution, reducing async repository orchestration inside the view.
- Worker-home navigation chrome and dialog/alert presentation now use shared helpers in `WorkerHomePresentation.swift`, reducing modifier-stack complexity in the parent screen.
- Worker-home sheet-close, foreground refresh, and connectivity event handling now uses shared helpers in `WorkerHomeEvents.swift`, further reducing repeated `onChange` orchestration in the parent view.
- Worker-home helper coverage now includes tests for:
  - dashboard snapshot filtering and failure fallbacks
  - enabled-module loading
  - initial/shared-device presentation state
  - initial site resolution
  - attention routing
  - dismissal state updates
- Worker-home event/presentation coverage now includes tests for:
  - reconnect-triggered recall queue draining
  - medication/module/new-declaration dismissal refresh behavior
  - active scene refresh and badge clearing
  - optional alert binding dismissal state
  - recall cancel state clearing
  - site info to site-selection presentation handoff
- Recall flow coverage now includes tests for:
  - offline queued recall
  - online successful recall
  - blocked / no-longer-recallable queue drain handling
  - transient failure queue drain stopping behavior
  - recall success card visibility/reset logic
- Added `FatigueAssessmentViewModel` coverage for:
  - derived payload trimming and fallback worker-name shaping
  - submit success path with observability logging
  - submit failure path with observability logging
- Added `PsychosocialPulseViewModel` coverage for:
  - conversational step progression and final submit behavior
  - support-check-in submit gating and critical-risk derivation
  - site refresh behavior
  - submit failure observability logging
- Added `SupabaseModuleSubmissionRepository` coverage for:
  - fatigue submission row mapping
  - psychosocial submission row mapping
  - fatigue / psychosocial fetch-row to entry mapping
  - worker-facing psychosocial filtering of wellbeing-only rows
  - invalid worker/reviewer UUID guards on public repository methods
- `resolveWorkerHomeInitialSite(...)` now accepts a small `WorkerLocationProviding` protocol seam so location-based site resolution can be tested without changing runtime behavior.
- `WorkerHomePresentation.swift` now exposes tiny state helpers for optional alert bindings, recall dismissal clearing, and site-info to site-selection presentation switching so presentation logic can be tested without changing runtime UI behavior.
- `SupabaseModuleSubmissionRepository.swift` now exposes tiny internal row-building/filtering seams used by tests, without changing its public runtime behavior.

### Web app

- Added shared request parsing/validation in `lib/api-validation.ts`.
- Completed migration of API JSON body parsing onto shared schema-backed parsing. There are no remaining raw `request.json()` calls under `app/api`.
- Added shared review/admin/purge request schemas in `lib/review-request-schemas.ts` with targeted tests in `lib/__tests__/review-request-schemas.test.ts`.
- Added DB-backed route throttling in `lib/rate-limit.ts` and applied it across high-value review, comment, feedback, post-incident, purge, and PDF export routes.
- Added route error states for:
  - root app
  - global app shell
  - admin
  - medic
  - superuser
- Added pagination helpers in `lib/pagination.ts` and `components/PaginationControls.tsx`.
- Updated superuser feedback and purge-log pages to page/filter on the server.
- Updated admin and superuser purge-log pages to avoid unbounded list loading.
- Reworked admin submissions dashboard to use an aggregate RPC instead of fetching all submissions into memory.

### Database / RLS

- Added migration `030_enforce_active_medic_contract_in_rls.sql`.
- Added helper `is_current_user_active_medic()` and used it to gate medic-scoped access in:
  - `submissions`
  - `medication_declarations`
  - `module_submissions`
  - `submission_comments`
  - `worker_memberships`
  - script file access in `storage.objects`
- Updated the exported policy snapshot in `docs/rls_policies_2026_04_05.md` to reflect the new contract-aware rules.
- Added migration `031_admin_submission_dashboard_rpc.sql` for the admin submissions aggregate dashboard.
- Added migration `032_psychosocial_worker_pulse_scoring_rpc.sql`.
- Added RPC `score_psychosocial_worker_pulse(jsonb)` so psychosocial derived risk, support flags, and review flags can be computed server-side from the worker pulse payload.
- Added migration `033_app_event_log.sql`.
- Added `app_event_log` plus `log_client_app_event(...)` to support lightweight cross-app observability without exposing direct client writes to the log table.
- Added migration `034_app_event_log_actor_action_idx.sql` to keep actor/action-based event log lookups efficient for route throttling.

### Observability

- Added shared web event logging helper in `lib/app-event-log.ts`.
- Instrumented high-value web API mutation routes for:
  - feedback submission
  - emergency review save
  - medication review save
  - fatigue review save
  - psychosocial review save
  - emergency purge
  - medication purge
  - fatigue purge
  - psychosocial purge
- Added iOS observability repository:
  - `meddec/Data/Supabase/SupabaseObservabilityRepository.swift`
- Wired iOS event logging into:
  - auth sign-in, registration completion, sign-out
  - fatigue submission attempt/success/failure
  - psychosocial submission attempt/success/failure
- Kept pre-auth iOS sign-in failures as local-only for now because no authenticated session exists yet for DB-backed event writes.
- Extended web event logging coverage so throttled actions now emit the request activity needed for rate-limit enforcement over time.

## Files Added Or Updated

### Web

- `lib/api-validation.ts`
- `lib/pagination.ts`
- `lib/__tests__/pagination.test.ts`
- `components/PaginationControls.tsx`
- `components/RouteErrorState.tsx`
- `app/error.tsx`
- `app/global-error.tsx`
- `app/admin/error.tsx`
- `app/medic/error.tsx`
- `app/superuser/error.tsx`
- `app/api/feedback/route.ts`
- `app/api/feedback/[id]/route.ts`
- `app/api/admin/audit/route.ts`
- `app/api/businesses/[id]/modules/route.ts`
- `app/api/businesses/[id]/reminder-interval/route.ts`
- `app/api/businesses/[id]/trial/route.ts`
- `app/api/businesses/[id]/logo/route.ts`
- `app/api/declarations/[id]/comments/route.ts`
- `app/api/declarations/[id]/pdf/route.ts`
- `app/api/declarations/[id]/review/route.ts`
- `app/api/declarations/purge/route.ts`
- `app/api/fatigue-assessments/[id]/pdf/route.ts`
- `app/api/fatigue-assessments/[id]/review/route.ts`
- `app/api/fatigue-assessments/purge/route.ts`
- `app/api/medication-declarations/[id]/pdf/route.ts`
- `app/api/medication-declarations/[id]/review/route.ts`
- `app/api/medication-declarations/purge/route.ts`
- `app/api/psychosocial-assessments/[id]/pdf/route.ts`
- `app/api/psychosocial-assessments/[id]/review/route.ts`
- `app/api/psychosocial-assessments/post-incident/route.ts`
- `app/api/psychosocial-assessments/purge/route.ts`
- `app/api/submissions/[id]/test-flag/route.ts`
- `app/superuser/feedback/page.tsx`
- `app/admin/purge-log/page.tsx`
- `app/superuser/purge-log/page.tsx`
- `app/admin/submissions/page.tsx`
- `components/superuser/FeedbackReview.tsx`
- `components/admin/PurgeLog.tsx`
- `components/admin/AdminSubmissions.tsx`
- `docs/migrations/030_enforce_active_medic_contract_in_rls.sql`
- `docs/migrations/031_admin_submission_dashboard_rpc.sql`
- `docs/migrations/032_psychosocial_worker_pulse_scoring_rpc.sql`
- `docs/migrations/033_app_event_log.sql`
- `docs/migrations/034_app_event_log_actor_action_idx.sql`
- `docs/rls_policies_2026_04_05.md`
- `lib/app-event-log.ts`
- `lib/review-request-schemas.ts`
- `lib/rate-limit.ts`
- `lib/__tests__/review-request-schemas.test.ts`

### iOS

- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseService.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Info.plist`
- `/Volumes/1tbusb/xcode/meddec/meddec/Configs/Meddec.xcconfig`
- `/Volumes/1tbusb/xcode/meddec/meddec/Configs/MeddecSecrets.example.xcconfig`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/PendingRecallQueue.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/PendingRecallQueueTests.swift`
- `/Volumes/1tbusb/xcode/meddec/SECURITY_MEMORY.md`
- `/Volumes/1tbusb/xcode/meddec/.gitignore`
- `/Volumes/1tbusb/xcode/meddec/meddec.xcodeproj/project.pbxproj`
- `/Volumes/1tbusb/xcode/meddec/meddec/Data/Supabase/SupabaseObservabilityRepository.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Auth/AuthViewModel.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/FatigueAssessmentViewModel.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/PsychosocialPulseViewModel.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/PsychosocialPulseConversationSections.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeView.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeActiveCards.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeDashboardComponents.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeDashboardState.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeLifecycle.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomePresentation.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Worker/WorkerHomeEvents.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/TestSupport.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/WorkerHomeHelperTests.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/WorkerHomePresentationAndEventsTests.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/WorkerRecallFlowTests.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/FatigueAssessmentViewModelTests.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/PsychosocialPulseViewModelTests.swift`
- `/Volumes/1tbusb/xcode/meddec/meddecTests/SupabaseModuleSubmissionRepositoryTests.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/AppEnvironment.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/ContentView.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Domain/Repositories.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Domain/Models.swift`
- `/Volumes/1tbusb/xcode/meddec/meddec/Presentation/Superuser/SuperuserDashboardView.swift`

## Verification

### Web

- `npm test`
  - Result: passed
- `npx tsc --noEmit`
  - Result: passed

### iOS

- `xcodebuild -project /Volumes/1tbusb/xcode/meddec/meddec.xcodeproj -scheme meddec -destination 'generic/platform=iOS Simulator' build`
  - Result: passed
- `xcodebuild -project /Volumes/1tbusb/xcode/meddec/meddec.xcodeproj -scheme meddec -destination 'platform=iOS Simulator,id=B725EB3F-2F92-4FF1-AA2F-D78A2E32F05A' test -only-testing:meddecTests/WorkerHomeHelperTests -only-testing:meddecTests/WorkerRecallFlowTests -only-testing:meddecTests/FatigueAssessmentViewModelTests -only-testing:meddecTests/PsychosocialPulseViewModelTests`
  - Result: passed
- Simulator launch issue after xcconfig migration
  - Root cause: `.xcconfig` treated raw `https://...` as `https:` because `//` started a comment, which led to a nil `supabaseURL.host` crash inside the Supabase SDK
  - Result: fixed by correcting xcconfig URL syntax and adding clearer config validation in `SupabaseService.swift`

## Suggested Next iOS Test Targets

- Worker-home coverage has now reached the lifecycle, routing, dismissal, recall, events, and presentation-state helper slices.
- The next safest worker-home additions are any remaining pure/state-driven helpers, especially under `WorkerHomeDashboardComponents.swift`, `WorkerHomeDashboardState.swift`, or `WorkerHomeRecall.swift` where behavior can be tested without UI inspection.
- If repository coverage should deepen further, the next practical slice is review/update path coverage in `SupabaseModuleSubmissionRepository.swift` using similarly small internal seams rather than network-coupled tests.

## Clean Restart Baseline

- Starting repo for iOS follow-up work:
  - `/Volumes/1tbusb/xcode/meddec`
- Starting memory file:
  - `/Volumes/1tbusb/MedM8_WebApp/docs/session-handoff-2026-04-05-security-and-scale-hardening.md`
- Safe assumption for next session:
  - worker-home lifecycle/routing/dismissal/recall helper tests are now in place and passing in the targeted simulator run
  - worker-home events/presentation state helper tests are now in place and passing in the targeted simulator run
  - `FatigueAssessmentViewModel` tests are in place and passing
  - `PsychosocialPulseViewModel` tests are in place and passing
  - `SupabaseModuleSubmissionRepository` mapping/guard tests are now in place and passing
  - no broader refactor was performed beyond tiny internal seams needed to make worker-home presentation state and repository row mapping practical to test
- New automated coverage added this session:
  - `meddecTests/WorkerHomeHelperTests.swift`
  - `meddecTests/WorkerHomePresentationAndEventsTests.swift`
  - `meddecTests/WorkerRecallFlowTests.swift`
  - `meddecTests/FatigueAssessmentViewModelTests.swift`
  - `meddecTests/PsychosocialPulseViewModelTests.swift`
  - `meddecTests/SupabaseModuleSubmissionRepositoryTests.swift`
  - `meddecTests/TestSupport.swift`
- Small production-code change made only to support practical testing:
  - `WorkerHomeLifecycle.swift` now depends on `WorkerLocationProviding` instead of the concrete helper type for initial-site resolution
  - `WorkerHomeView.swift` makes `WorkerLocationHelper` conform to `WorkerLocationProviding`
  - `WorkerHomePresentation.swift` now uses tiny extracted state helpers for optional-message bindings, recall dismissal clearing, and site-selection presentation switching
  - `SupabaseModuleSubmissionRepository.swift` now uses tiny internal row initializer/filter seams so fatigue and psychosocial mapping can be tested without live Supabase calls
- Most useful next testing slices from here:
  - remaining pure/state worker-home helpers in `WorkerHomeDashboardComponents.swift`, `WorkerHomeDashboardState.swift`, or `WorkerHomeRecall.swift`
  - review/update mapping paths in `SupabaseModuleSubmissionRepository.swift`
- Verification baseline from this session:
  - `xcodebuild -project /Volumes/1tbusb/xcode/meddec/meddec.xcodeproj -scheme meddec -destination 'generic/platform=iOS Simulator' build`
    - passed
  - `xcodebuild -project /Volumes/1tbusb/xcode/meddec/meddec.xcodeproj -scheme meddec -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.4' test -only-testing:meddecTests/WorkerHomePresentationAndEventsTests -only-testing:meddecTests/SupabaseModuleSubmissionRepositoryTests`
    - passed
  - `xcodebuild -project /Volumes/1tbusb/xcode/meddec/meddec.xcodeproj -scheme meddec -destination 'platform=iOS Simulator,id=B725EB3F-2F92-4FF1-AA2F-D78A2E32F05A' test -only-testing:meddecTests/WorkerHomeHelperTests -only-testing:meddecTests/WorkerRecallFlowTests -only-testing:meddecTests/FatigueAssessmentViewModelTests -only-testing:meddecTests/PsychosocialPulseViewModelTests`
    - passed
- Recommended intent for the next session:
  - continue iOS automated coverage in small shippable slices
  - avoid broad refactors unless a very small seam is required to make tests practical

### Applied By User

- `030_enforce_active_medic_contract_in_rls.sql`
  - Result: user confirmed successful application
- `034_app_event_log_actor_action_idx.sql`
  - Result: user confirmed successful application

## Important Rollout Notes

- The Supabase anon key should still be rotated before iOS production release because the previous value existed in source history.
- After anon key rotation, each local/CI environment must update its own secret source rather than relying on committed files.
- Any `.xcconfig` `SUPABASE_URL` value must use escaped xcconfig-safe syntax rather than raw `https://...`.
- The admin submissions dashboard now depends on the `031_admin_submission_dashboard_rpc.sql` migration being present in Supabase.
- Expired medic enforcement is now intended to live primarily at the DB boundary; client checks remain useful for UX but are no longer the trust boundary.
- Psychosocial submissions in iOS now depend on `032_psychosocial_worker_pulse_scoring_rpc.sql` being applied in Supabase.
- Cross-app event logging now depends on `033_app_event_log.sql` being applied in Supabase.
- Web route throttling now depends on `034_app_event_log_actor_action_idx.sql` for efficient event-log lookups under load.
- The iOS psychosocial UI still uses a local preview risk summary before submit, but the persisted score summary and review flags now come from the server RPC.
- The iOS superuser dashboard module state for psychosocial was corrected to match the web app's active/live status.

## Current Review Checklist Status

Addressed or substantially addressed:

1. Hardcoded Supabase credentials in iOS
2. Pending recall queue stored in plain `UserDefaults`
3. Client-side contract expiry enforcement without matching RLS
6. No input validation schema on web API routes
7. No pagination on large list views
8. Psychosocial scoring thresholds hardcoded in iOS
9. No error boundaries in the web app
11. No centralized logging / observability
12. Manual web request parsing gaps on JSON routes
13. No shared throttling on spam-prone authenticated actions

Still open:

4. Break up `WorkerHomeView.swift`
5. Expand test coverage for critical flows
10. Normalize the iOS ViewModel/state pattern

## Item 4 Progress

- `WorkerHomeView.swift` refactoring has started with the first dashboard presentation extraction.
- Added `WorkerHomeDashboardComponents.swift` containing reusable dashboard cards, headers, action tiles, recent activity rows, and extracted dashboard section views.
- `WorkerHomeView.swift` now consumes extracted components and dedicated sections instead of carrying most dashboard presentation inline.
- Completed section extractions so far:
  - current site / support contacts
  - recent activity
  - quick actions
  - needs attention
- Removed the old dead `actionButtons` and `wellbeingCard` legacy blocks after those dashboard responsibilities had been fully replaced by extracted sections.
- Moved the `homeSheets` presentation helper into `WorkerHomePresentation.swift` so sheet wiring is no longer embedded at the bottom of `WorkerHomeView.swift`.
- Replaced repeated sheet-close and foreground refresh `onChange` bodies with named private handler methods in `WorkerHomeView.swift`.
- Added shared active-card shell utilities in `WorkerHomeDashboardComponents.swift` so the declaration, medication, fatigue, and psychosocial active cards reuse the same framed container and status badge presentation.
- Moved the pure medication, fatigue, and psychosocial status/display mapping helpers out of `WorkerHomeView.swift` and into `WorkerHomeDashboardComponents.swift`, so the parent file is carrying less presentation support logic.
- Extracted the conversational psychosocial workflow steps into `PsychosocialPulseConversationSections.swift`, reducing `PsychosocialPulseView.swift` from 1143 lines to 806 lines while keeping the parent file focused on orchestration.
- Extracted the active declaration, medication, fatigue, and psychosocial dashboard cards into `WorkerHomeActiveCards.swift`.
- Shared declaration/fatigue display helpers now live in `WorkerHomeDashboardComponents.swift`, which keeps the parent worker view from regaining duplicated presentation logic.
- Extracted the dashboard assembly rules for attention, recent activity, emergency blocking, and quick actions into `WorkerHomeDashboardState.swift`, so the parent screen no longer builds most of those UI-facing models inline.
- Extracted the lifecycle-heavy worker-home loading flows into `WorkerHomeLifecycle.swift`, including dashboard snapshot loading, module loading, and initial site resolution.
- Extracted the home-tab navigation chrome plus dialog/alert modifier stack into shared presentation helpers in `WorkerHomePresentation.swift`, and replaced inline recall/shared-device flows with named methods in `WorkerHomeView.swift`.
- Extracted the remaining shared sheet-close, connectivity, and scene-phase refresh coordination into `WorkerHomeEvents.swift`, so `WorkerHomeView.swift` no longer carries the repeated `onChange` task-launch bodies inline.
- Expanded `WorkerHomeRecall.swift` so recall confirmation now returns a UI update model, and the parent view no longer owns the inline branch-heavy recall outcome mapping for queued, recalled, and failed states.
- Added `WorkerHomeRouting.swift` so dashboard tap destinations now use a shared route model for attention actions, history-tab jumps, and site support navigation instead of repeating routing decisions inline across the parent screen.
- Expanded `WorkerHomeLifecycle.swift` so initial shared-device and wizard presentation decisions now come from a dedicated presentation-state helper instead of being branched inline inside `WorkerHomeView.swift`.
- Added `WorkerHomeDismissals.swift` so the three dashboard dismissal flows now share one helper for persisting dismissal IDs and removing the dismissed item from the active list.
- Expanded `WorkerHomeRecall.swift` so recall-success visibility/reset rules now come from a dedicated presentation-state helper instead of being branched inline across multiple spots in `WorkerHomeView.swift`.
- Removed the now-dead active-card wrapper methods, dead profile/reminder prompt card glue, and the unused `isLoadingSite` state from `WorkerHomeView.swift` after confirming those paths were no longer referenced following earlier dashboard extractions.
- Removed the now-unused `WorkerDashboardProfilePromptCard` and `WorkerDashboardReviewReminderCard` component types from `WorkerHomeDashboardComponents.swift`.
- `WorkerHomeView.swift` now sits at 1133 lines, while `WorkerHomeActiveCards.swift` owns 522 lines of active-card presentation, `WorkerHomeDashboardState.swift` owns 454 lines of dashboard state shaping, `WorkerHomeLifecycle.swift` owns 127 lines of loading and initial-presentation helpers, `WorkerHomePresentation.swift` owns 260 lines of shared presentation helpers, `WorkerHomeEvents.swift` owns 60 lines of event orchestration helpers, `WorkerHomeRecall.swift` owns 129 lines of recall coordination and recall-success presentation rules, `WorkerHomeRouting.swift` owns 26 lines of route modeling, `WorkerHomeDismissals.swift` owns 17 lines of dismissal helpers, `WorkerHomeDashboardComponents.swift` owns 860 lines of shared dashboard UI, and `PsychosocialPulseConversationSections.swift` owns 538 lines of conversational subviews.
- Remaining work for item 4 is now less about leftover duplication and more about whether to keep chasing parent-file size versus shifting effort into tests and state-pattern normalization. The largest obvious cleanup surface is now shared dashboard UI in `WorkerHomeDashboardComponents.swift`, not hidden orchestration inside `WorkerHomeView.swift`.

## Recommended Next Step

Recommended next move: keep the refactor paused and continue iOS automated coverage in small shippable slices. The highest-value remaining area is pure/state-driven worker-home behavior or repository review/update mapping, not broader `WorkerHomeView.swift` restructuring.
