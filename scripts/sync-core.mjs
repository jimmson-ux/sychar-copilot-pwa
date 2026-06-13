/**
 * Vendor the shared packages (@sychar/core + @sychar/integrations) into a school
 * repo. Single source of truth = sychar-system/packages/*; the school repos consume
 * a vendored copy (never edit the copy). Same model as the Oloolaiser/PCEA seeds.
 *
 * Run: node scripts/sync-core.mjs <path-to-school-repo>
 *
 * Copies packages/core → <repo>/src/vendor/sychar-core
 *        packages/integrations → <repo>/src/vendor/sychar-integrations
 * and prints a tsconfig path-alias snippet to add (@sychar/core, @sychar/integrations).
 * Idempotent; overwrites the vendored copies.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/sync-core.mjs <path-to-school-repo>')
  process.exit(1)
}
const repo = resolve(target)
if (!existsSync(repo)) { console.error(`❌ Target repo not found: ${repo}`); process.exit(1) }

const vendor = join(repo, 'src', 'vendor')
mkdirSync(vendor, { recursive: true })

const pkgs = [
  ['core', 'sychar-core'],
  ['integrations', 'sychar-integrations'],
]
for (const [src, dest] of pkgs) {
  const from = join(ROOT, 'packages', src)
  const to = join(vendor, dest)
  if (!existsSync(from)) { console.log(`  ! skip ${src} (not found)`); continue }
  rmSync(to, { recursive: true, force: true })
  cpSync(from, to, { recursive: true })
  console.log(`  ✓ ${src} → src/vendor/${dest}`)
}

console.log(`\n✅ Vendored into ${repo}`)
console.log('\nAdd these tsconfig path aliases to the school repo (paths under compilerOptions):')
console.log(JSON.stringify({
  '@sychar/core': ['./src/vendor/sychar-core/src/index.ts'],
  '@sychar/core/*': ['./src/vendor/sychar-core/src/*'],
  '@sychar/integrations': ['./src/vendor/sychar-integrations/src/index.ts'],
  '@sychar/integrations/*': ['./src/vendor/sychar-integrations/src/*'],
}, null, 2))
console.log('\nInstall optional peers if used: npm i posthog-js @microsoft/clarity firebase @upstash/redis @upstash/qstash')
