#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TARGETS = [
  'package.json',
  'packages/jssdk/package.json',
  'packages/jssdk-nuxt/package.json'
]

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/

const newVersion = process.argv[2]

if (!newVersion || !SEMVER_RE.test(newVersion)) {
  process.stderr.write([
    'Usage: pnpm run release:bump <version>',
    '       version must match <major>.<minor>.<patch>[-prerelease]',
    '       e.g. 1.1.1, 1.2.0, 2.0.0-rc.1'
  ].join('\n') + '\n')
  process.exit(1)
}

const targets = TARGETS.map((rel) => {
  const abs = join(repoRoot, rel)
  const raw = readFileSync(abs, 'utf8')
  const pkg = JSON.parse(raw)
  return { rel, abs, raw, current: pkg.version }
})

const distinct = new Set(targets.map(t => t.current))
if (distinct.size !== 1) {
  process.stderr.write('Refusing to bump: package versions are out of sync:\n')
  for (const { rel, current } of targets) {
    process.stderr.write(`  ${rel}: ${current}\n`)
  }
  process.stderr.write('Resolve the drift manually, then retry.\n')
  process.exit(1)
}

const [currentVersion] = distinct
if (currentVersion === newVersion) {
  process.stderr.write(`Refusing to bump: new version ${newVersion} matches the current one.\n`)
  process.exit(1)
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

for (const target of targets) {
  const pattern = new RegExp(`("version"\\s*:\\s*")${escapeRegExp(target.current)}(")`)
  if (!pattern.test(target.raw)) {
    process.stderr.write(`Failed to locate version field in ${target.rel}\n`)
    process.exit(1)
  }
  const updated = target.raw.replace(pattern, `$1${newVersion}$2`)
  writeFileSync(target.abs, updated)
  process.stdout.write(`Updated ${target.rel}: ${currentVersion} → ${newVersion}\n`)
}

process.stdout.write('\nRefreshing pnpm lockfile…\n')
const install = spawnSync('pnpm', ['install', '--lockfile-only'], {
  cwd: repoRoot,
  stdio: 'inherit'
})
if (install.status !== 0) {
  process.stderr.write('\npnpm install --lockfile-only failed. Fix the issue and re-run.\n')
  process.exit(install.status ?? 1)
}

process.stdout.write([
  '',
  `Bumped to ${newVersion}. Review the diff and commit:`,
  '',
  '  git add -A',
  `  git commit -m "chore(release): v${newVersion}"`,
  ''
].join('\n'))
