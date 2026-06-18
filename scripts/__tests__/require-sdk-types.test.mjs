#!/usr/bin/env node
// Fixture tests for scripts/_require-sdk-types.mjs (#213).
//
// Run with: node --test scripts/__tests__/require-sdk-types.test.mjs
//
// The helper calls process.exit(), so each case runs it out-of-process and
// asserts the exit code + message — mirroring docs-link-check.test.mjs. The
// REQUIRE_SDK_TYPES_ROOT env override points the marker lookup at a temp
// fixture, so the test is hermetic regardless of whether dist/ is built here.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const HELPER_URL = pathToFileURL(resolve(__dirname, '..', '_require-sdk-types.mjs')).href
const MARKER_REL = 'packages/jssdk/dist/esm/index.d.ts'

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'require-sdk-types-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function runGuard(root, label = 'test:guard') {
  const code = `import { requireSdkTypes } from ${JSON.stringify(HELPER_URL)}\nrequireSdkTypes(${JSON.stringify(label)})\n`
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: REPO_ROOT,
    env: { ...process.env, REQUIRE_SDK_TYPES_ROOT: root },
    encoding: 'utf8'
  })
}

test('require-sdk-types: marker absent → exit 1 with the actionable dev:prepare message', () => {
  withFixture((root) => {
    const r = runGuard(root, 'docs:typecheck-blocks')
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stderr, /\[docs:typecheck-blocks\]/)
    assert.match(r.stderr, /@bitrix24\/b24jssdk types not found/)
    assert.match(r.stderr, /packages\/jssdk\/dist\/esm\/index\.d\.ts/)
    assert.match(r.stderr, /pnpm run dev:prepare/)
  })
})

test('require-sdk-types: marker present → exits 0 and proceeds (no output)', () => {
  withFixture((root) => {
    const marker = join(root, ...MARKER_REL.split('/'))
    mkdirSync(dirname(marker), { recursive: true })
    writeFileSync(marker, 'export {}\n', 'utf8')

    const r = runGuard(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.equal(r.stderr, '')
  })
})

test('require-sdk-types: the message prefix uses the caller-supplied label', () => {
  withFixture((root) => {
    const r = runGuard(root, 'contributing:typecheck')
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stderr, /\[contributing:typecheck\]/)
  })
})
