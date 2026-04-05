# MedPass Web App

The web app is the operations and governance portal for MedPass. It supports:

- medic review of emergency declarations, medication declarations, fatigue, and psychosocial cases
- admin management of staff, sites, invite codes, billing, and purge logs
- superuser management of businesses, platform billing, reporting, and feedback

The companion iOS app lives at `/Volumes/1tbusb/xcode/meddec` and handles worker-facing submissions plus mobile medic/admin workflows.

## Stack

- Next.js 14 App Router
- React 18
- Supabase Auth, PostgREST, Storage, and SSR helpers
- Tailwind CSS
- Vitest for unit tests

## Local Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm test
npm run build
```

The app expects Supabase environment variables in local env files:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

## Main App Areas

- `app/medic`
  Medic queue, detail, export, and review workflows
- `app/admin`
  Business-scoped administration and reporting
- `app/superuser`
  Platform-wide business management and reporting
- `app/api`
  Route handlers for review actions, exports, purge jobs, feedback, and business configuration
- `lib`
  Shared parsing, access control, billing helpers, Supabase clients, and testable business logic
- `components`
  UI by role and module

## Access Model

The main roles are:

- `medic`
- `admin`
- `superuser`
- `pending_medic`

Business and site access are enforced through Supabase and in route/page guards. Shared scope helpers live in `lib/medic-scope.ts`.

## Data Governance Notes

- Reviewed/exported PHI is purged from operational tables after the retention window and copied into immutable audit logs.
- Emergency declaration comments are now stored in the `submission_comments` table as append-only rows rather than a mutable JSON array on `submissions`.
- Superuser reporting is intended to be de-identified/aggregate-only at the database boundary, not just hidden in the UI.

Recent migration of note:

- `docs/migrations/029_normalize_submission_comments.sql`
  Creates `submission_comments`, backfills legacy JSON comments, and makes comment history append-only.

## Testing

Current web tests focus on shared business logic in `lib/__tests__`.

High-value regression areas:

- medic site/business scope checks
- comment parsing and append-only comment loading
- queue parameter handling
- risk chip derivation

## Operational Notes

- Apply database migrations before deploying code that depends on them.
- `SUPABASE_SERVICE_ROLE_KEY` is used only in trusted server routes and server components.
- The cron purge route is protected by `Authorization: Bearer <CRON_SECRET>`.
