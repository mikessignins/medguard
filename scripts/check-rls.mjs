import { spawnSync } from 'node:child_process'

const databaseUrl = process.env.DATABASE_URL

if (!databaseUrl) {
  console.error('DATABASE_URL is required for the RLS coverage check.')
  process.exit(1)
}

const allowlist = new Set([
  // Add reviewed non-sensitive public tables here only when a table truly must
  // remain without RLS.
])

const sql = `
select n.nspname || '.' || c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by 1;
`

const result = spawnSync('psql', [databaseUrl, '-At', '-c', sql], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

if (result.error) {
  console.error(`Unable to run psql: ${result.error.message}`)
  process.exit(1)
}

if (result.status !== 0) {
  console.error(result.stderr.trim() || 'RLS coverage query failed.')
  process.exit(result.status ?? 1)
}

const missing = result.stdout
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .filter(table => !allowlist.has(table))

if (missing.length > 0) {
  console.error(`Tables missing RLS:\n${missing.join('\n')}`)
  process.exit(1)
}

console.log('RLS coverage check passed')
