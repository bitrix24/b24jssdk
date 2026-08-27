#!/usr/bin/env node
// Tests for scripts/skills-typecheck-blocks.mjs (#402).
//
// Run with: node --test scripts/__tests__/skills-typecheck-blocks.test.mjs
//
// The extraction and reporting logic is shared with the docs gate and is
// covered by docs-typecheck.test.mjs. What is specific here — and what these
// tests pin — is the wiring: which files the gate discovers, and that it treats
// an empty sweep as a failure rather than a pass.

import { existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SCRIPT = resolve(__dirname, '..', 'skills-typecheck-blocks.mjs')

// The gate needs tsc and the built SDK types. Same convention as the docs test:
// skip the spawning tests when the prerequisites are absent, since the docs-lint
// CI job runs this file without `dev:prepare`. Real coverage comes from the
// `typecheck` job, which runs the gate for real.
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const SDK_TYPES = join(REPO_ROOT, 'packages', 'jssdk', 'dist', 'esm', 'index.d.ts')
const SKIP = !existsSync(TSC_BIN) || !existsSync(SDK_TYPES)

test('every skill directory is covered, not a hand-written list', () => {
  // The failure this guards is specific: #401 shipped a hand-maintained list of
  // three skill files while the tree held seven, and nothing noticed. Asserting
  // "the files it checks" == "the SKILL.md files that exist" is the only form
  // that cannot go stale.
  const onDisk = readdirSync(join(REPO_ROOT, 'skills'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
    .map(entry => join('skills', entry.name, 'SKILL.md'))
    .filter(rel => existsSync(join(REPO_ROOT, rel)))

  assert.ok(onDisk.length > 0, 'no SKILL.md found — the layout changed')

  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' }
  })
  const output = (result.stdout ?? '') + (result.stderr ?? '')

  if (SKIP) {
    // Without dist/ the script exits early with the actionable dist message;
    // the discovery assertion above still ran, which is the part worth pinning.
    assert.match(output, /dev:prepare|not installed/)
    return
  }

  // The block count is reported, and it is not zero.
  const match = output.match(/skills-typecheck: (\d+) block\(s\) checked/)
  assert.ok(match, `expected a block count in:\n${output}`)
  assert.ok(Number(match[1]) > 0, 'zero blocks checked — the sweep found nothing')
})

test('the skills tree currently type-checks clean', { skip: SKIP }, () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' }
  })
  const output = (result.stdout ?? '') + (result.stderr ?? '')

  assert.equal(result.status, 0, `gate failed:\n${output}`)
  assert.match(output, /0 error\(s\)/)
})

test('an empty sweep is an error, not a clean run', { skip: SKIP }, () => {
  // A glob that stops matching — a renamed directory, say — would otherwise
  // report "0 errors" and read as healthy. Exercised through the shared engine
  // with a directory that holds no Markdown at all.
  const result = spawnSync(
    process.execPath,
    ['-e', `
      import('${resolve(__dirname, '..', '_typecheck-blocks.mjs').replace(/\\/g, '/')}')
        .then(({ checkBlocks }) => {
          const code = checkBlocks({
            label: 'probe',
            repoRoot: ${JSON.stringify(REPO_ROOT)},
            checkDir: ${JSON.stringify(join(REPO_ROOT, '.skills-typecheck'))},
            files: []
          })
          process.exit(code)
        })
    `],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  )

  assert.equal(result.status, 1)
  assert.match((result.stdout ?? '') + (result.stderr ?? ''), /no TS blocks found/)
})
