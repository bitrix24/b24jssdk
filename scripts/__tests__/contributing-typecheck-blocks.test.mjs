#!/usr/bin/env node
// Tests for scripts/contributing-typecheck-blocks.mjs (#435).
//
// Run with: node --test scripts/__tests__/contributing-typecheck-blocks.test.mjs
//
// Extraction and reporting are shared with the docs gate and covered by
// docs-typecheck.test.mjs. What is specific here is the wiring: which files the
// gate discovers, that an empty sweep is a failure rather than a pass, and that
// a broken fence in a guide actually fails.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SCRIPT = resolve(__dirname, '..', 'contributing-typecheck-blocks.mjs')
const GUIDES = join(REPO_ROOT, '.github', 'contributing')

// Same convention as the docs and skills tests: the docs-lint CI job runs this
// file without `dev:prepare`, so the spawning tests skip when dist/ is absent.
// Real coverage comes from the `typecheck` job, which runs the gate for real.
const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const SDK_TYPES = join(REPO_ROOT, 'packages', 'jssdk', 'dist', 'esm', 'index.d.ts')
const SKIP = !existsSync(TSC_BIN) || !existsSync(SDK_TYPES)

test('the guides are walked, not listed', () => {
  // The guides get added to and split regularly, and #420 plans to move more
  // prose into them. A hand-maintained list went stale once already (#401), so
  // assert the gate walks the directory rather than naming files.
  const source = readFileSync(SCRIPT, 'utf8')
  assert.match(source, /walkMarkdownFiles\(join\(REPO_ROOT, '\.github', 'contributing'\)\)/)

  const onDisk = readdirSync(GUIDES).filter(name => name.endsWith('.md'))
  assert.ok(onDisk.length > 0, 'no guides found — the layout changed')
})

test('the guides currently type-check clean', { skip: SKIP }, () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTIONS: '' }
  })
  const output = (result.stdout ?? '') + (result.stderr ?? '')

  assert.equal(result.status, 0, `gate failed:\n${output}`)

  const match = output.match(/contributing-typecheck: [^\n]*\D(\d+) block\(s\) checked/)
  assert.ok(match, `expected a block count in:\n${output}`)
  assert.ok(Number(match[1]) > 0, 'zero blocks checked — the sweep found nothing')
})

test('a deliberately broken fence in a guide fails the gate', { skip: SKIP }, () => {
  // The acceptance criterion of #435 is that a broken fence cannot reach main,
  // and the only proof of that is watching a broken one fail. This is how the
  // gap was found in the first place (#419), so it is how it is confirmed shut.
  const target = join(GUIDES, 'transports-and-results.md')
  const original = readFileSync(target, 'utf8')
  const marker = 'const result = await b24.actions.v3.call.make({'
  assert.ok(original.includes(marker), 'the fence this test injects into moved')

  try {
    writeFileSync(
      target,
      original.replace(marker, `const injected: number = 'not a number'\n${marker}`),
      'utf8'
    )
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(run.status, 1, 'the gate passed on a fence that does not compile')
    assert.match(run.stdout, /transports-and-results\.md:\d+:\d+ TS2322/)
  } finally {
    writeFileSync(target, original, 'utf8')
  }
})

test('an ignored fence carries a reason', () => {
  // `// @check-ignore` without a reason is how a gate quietly stops covering
  // something. Five fences are ignored here and each says why; keep it that way.
  for (const name of readdirSync(GUIDES).filter(f => f.endsWith('.md'))) {
    const lines = readFileSync(join(GUIDES, name), 'utf8').split('\n')
    for (const [index, line] of lines.entries()) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('// @check-ignore')) continue
      assert.match(
        trimmed,
        /^\/\/ @check-ignore: \S/,
        `${name}:${index + 1} — an ignored fence must say why`
      )
    }
  }
})
