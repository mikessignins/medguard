import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const failures = []

function walk(dir) {
  const entries = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (['.next', 'node_modules', '.git'].includes(name)) continue
      entries.push(...walk(path))
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      entries.push(path)
    }
  }
  return entries
}

const files = walk(join(root, 'app')).concat(walk(join(root, 'lib')))

const allowedServiceClientFiles = new Set([
  'app/admin/page.tsx',
  'app/admin/purge-log/page.tsx',
  'app/page.tsx',
  'app/api/admin/contractor-medics/route.ts',
  'app/api/admin/medics/[id]/password/route.ts',
  'app/api/businesses/[id]/logo/route.ts',
  'app/api/cron/purge-exports/route.ts',
  'app/api/medic-signup/route.ts',
  'app/api/superuser/businesses/route.ts',
  'app/api/superuser/businesses/[id]/admins/route.ts',
  'app/api/superuser/feedback/unread-count/route.ts',
  'app/superuser/business/[id]/page.tsx',
  'app/superuser/feedback/page.tsx',
  'app/superuser/layout.tsx',
  'app/superuser/page.tsx',
  'app/superuser/purge-log/page.tsx',
  'app/superuser/reports/page.tsx',
  'lib/admin-medics.ts',
  'lib/app-event-log.ts',
  'lib/billing.ts',
  'lib/contractor-expiry-notifications.ts',
  'lib/supabase/service.ts',
  'lib/worker-account-names.ts',
])

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const rel = file.slice(root.length + 1)

  if (/NextResponse\.json\(\s*\{\s*error:\s*[^}]*\.message/.test(text) || /new NextResponse\([^)]*\.message/.test(text)) {
    failures.push(`${rel}: do not return raw error.message to clients`)
  }

  const allowedServiceRoleFiles = [
    'lib/supabase/service.ts',
    'lib/declaration-processing.ts',
  ]
  if (!allowedServiceRoleFiles.includes(rel) && /SUPABASE_SERVICE_ROLE_KEY|createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(text)) {
    failures.push(`${rel}: use lib/supabase/service.ts for service-role access`)
  }

  if (!allowedServiceClientFiles.has(rel) && /createServiceClient\(\)/.test(text)) {
    failures.push(`${rel}: createServiceClient() must be reviewed and added to the service-role allowlist`)
  }

  if (/app\/api\/.*\/route\.(ts|tsx)$/.test(rel) && /export async function (POST|PATCH|DELETE)\b/.test(text)) {
    const intentionallyUnaudited = [
      'app/api/superuser/feedback/unread-count/route.ts',
    ].includes(rel)

    if (!intentionallyUnaudited && !text.includes('safeLogServerEvent')) {
      failures.push(`${rel}: mutating API route should emit safeLogServerEvent`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Security checks passed')
