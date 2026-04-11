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
