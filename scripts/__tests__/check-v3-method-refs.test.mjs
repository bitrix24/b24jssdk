#!/usr/bin/env node
// Fixture tests for scripts/check-v3-method-refs.mjs.
//
// Two layers. The first guards docs/skills against referencing a non-existent
// `actions.v3.<x>` action. The second (#463) holds v3 *method* names against a
// committed snapshot of a portal's own OpenAPI document — the layer that
// replaced the hardcoded allowlist removed in 2.0.0, this time without a list.
//
// Run with: node --test scripts/__tests__/check-v3-method-refs.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = resolve(__dirname, '..', 'check-v3-method-refs.mjs')

function writeFile(root, relPath, content) {
  const file = join(root, ...relPath.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

function withFixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'v3-refs-'))
  try {
    // The script reads README-AI.md and walks docs/content/docs + skills; make
    // sure they all exist even when a test only populates one of them.
    writeFile(root, 'packages/jssdk/README-AI.md', '# AI surface\n')
    mkdirSync(join(root, 'docs', 'content', 'docs'), { recursive: true })
    mkdirSync(join(root, 'skills'), { recursive: true })
    for (const [relPath, content] of Object.entries(files)) {
      writeFile(root, relPath, content)
    }
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function runCheck(root, { snapshots, args = [] } = {}) {
  const env = { ...process.env, V3_CHECK_ROOT: root }
  if (snapshots !== undefined) {
    const dir = join(root, 'snapshots')
    mkdirSync(dir, { recursive: true })
    for (const [name, methods] of Object.entries(snapshots)) {
      writeFileSync(join(dir, `openapi-${name}.json`), JSON.stringify({
        portalKind: name,
        snapshotDate: '2026-01-01',
        totals: { methods: methods.length, modules: 1 },
        methodsPerModule: {},
        methods: methods.map(method => ({ method, module: method.split('.')[0], operations: ['post'] }))
      }), 'utf8')
    }
    env.V3_SNAPSHOT_DIR = dir
  }
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' })
}

test('clean: real actions (including callTail/fetchTail) and any method pass', () => {
  withFixture({
    'docs/content/docs/ok.md': [
      '# OK',
      '',
      'Use `actions.v3.call.make`, `actions.v3.fetchTail.make`, `actions.v3.aggregate.make` and the',
      '`actions.v3.{call,callList,fetchList,callTail,fetchTail,aggregate}` family.',
      '',
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'note.collection.list\' })',
      'await $b24.actions.v3.callTail.make({ method: \'main.eventlog.tail\' })',
      'await $b24.actions.v3.aggregate.make({ method: \'x.aggregate\', select: { count: [\'id\'] } })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 problem/)
  })
})

test('phantom v3 action (dotted) is flagged', () => {
  withFixture({
    'skills/b24jssdk-rest/SKILL.md': 'For v3 counts use `actions.v3.frobnicate.make`.\n'
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /non-existent v3 action "actions\.v3\.frobnicate"/)
  })
})

test('phantom v3 action inside a {a,b,c} list is flagged', () => {
  withFixture({
    'docs/content/docs/filter.md': 'Used by `actions.v3.{call,callList,frobnicate}.make(...)`.\n'
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /non-existent v3 action "frobnicate"/)
  })
})

test('a method passed to v2 (not v3) is never flagged', () => {
  withFixture({
    'docs/content/docs/v2.md': [
      '```ts',
      'await $b24.actions.v2.call.make({ method: \'crm.deal.add\', params: {} })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  })
})

// ---------------------------------------------------------------------------
// The method-name layer (#463).
// ---------------------------------------------------------------------------

test('a v3 method no snapshot publishes is flagged, with the line', () => {
  withFixture({
    'docs/content/docs/v3.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.item.get\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /v3\.md:2 "crm\.item\.get" is used as a v3 method/)
  })
})

test('without a snapshot the layer is inert, and says so rather than passing quietly', () => {
  withFixture({
    'docs/content/docs/v3.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.item.get\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /no portal snapshot/)
  })
})

test('a name published by one snapshot only is accepted — portals differ', () => {
  // Measured: two cloud portals a day apart disagreed on 28 methods, and every
  // on-premise method exists in the cloud while 98 cloud ones do not exist on
  // the box. A name has to clear the union, not every snapshot.
  withFixture({
    'docs/content/docs/v3.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'note.collection.list\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { 'cloud': ['note.collection.list'], 'on-premise': ['tasks.task.get'] } })
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`)
  })
})

test('a marker naming the method silences it; one naming something else does not', () => {
  const block = [
    '```ts',
    'await $b24.actions.v3.call.make({ method: \'some.method\' })',
    '```'
  ]
  withFixture({
    'docs/content/docs/marked.md': ['// @check-ignore: `some.method` is a placeholder', ...block].join('\n'),
    'docs/content/docs/other.md': ['// @check-ignore: top-level return in an illustration', ...block].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    // The marker written for a different gate must not silence this one: an
    // exemption granted for one reason cannot acquire a second by proximity.
    assert.match(r.stdout, /other\.md:\d+ "some\.method"/)
    assert.doesNotMatch(r.stdout, /marked\.md/)
  })
})

test('a backticked name in ordinary prose is not a method position', () => {
  // This repository writes `result.items` and `crm.item.list` in backticks with
  // the same syntax; only the position tells them apart.
  withFixture({
    'docs/content/docs/prose.md': [
      'Under `actions.v3.call.make` the payload key is `result.items`, not',
      '`crm.item.list` — the latter is a v2 method name mentioned in passing.'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`)
  })
})

test('a JSDoc method-option bullet in v3 source is a method position; its v2 twin is not', () => {
  const bullet = version => [
    '/**',
    ` * @param options - parameters for actions.${version}.call.`,
    ' *     - `method: string` - REST API method name (eg: `crm.item.get`)',
    ' */',
    'export class X {}'
  ].join('\n')
  withFixture({
    'packages/jssdk/src/core/actions/v3/call.ts': bullet('v3'),
    'packages/jssdk/src/core/actions/v2/call.ts': bullet('v2')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /v3\/call\.ts:3 "crm\.item\.get"/)
    assert.doesNotMatch(r.stdout, /v2\/call\.ts/)
  })
})

test('--coverage reports and always exits 0, even with an unpublished name', () => {
  withFixture({
    'docs/content/docs/v3.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.item.get\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] }, args: ['--coverage'] })
    assert.equal(r.status, 0, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /publishes 1, documented here 0/)
    assert.match(r.stdout, /published by no snapshot: 1 — crm\.item\.get/)
  })
})

test('the fence tag decides the dialect when nothing else in the block does', () => {
  // The `[v2]` / `[v3]` tag is the only thing separating the two halves of a
  // side-by-side page, and a snippet that shows just the options object has no
  // `actions.vN.` call for the fallback to read. Without this rule the block
  // below is unattributed and silently skipped.
  withFixture({
    'docs/content/docs/side-by-side.md': [
      '```ts [v2]',
      'const options = { method: \'crm.item.list\', params: {} }',
      '```',
      '',
      '```ts [v3]',
      'const options = { method: \'crm.item.list\', params: {} }',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    // Line 6 is the v3 half; line 2 is the v2 half and must stay silent.
    assert.match(r.stdout, /side-by-side\.md:6 "crm\.item\.list"/)
    assert.doesNotMatch(r.stdout, /side-by-side\.md:2 /)
  })
})
