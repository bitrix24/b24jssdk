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
import { reduceDocument } from '../check-v3-method-refs.mjs'
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

test('a method name with a camelCase segment is seen — the snapshot publishes such names', () => {
  // `crm.activity.mail.getContent` is in the committed snapshot. An earlier
  // `METHOD_NAME` demanded lower-case throughout and simply did not see it,
  // which is worse than reporting it wrong: a gate blind to a class of real
  // names cannot claim fidelity to the real surface.
  withFixture({
    'docs/content/docs/camel.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.activity.mail.getThread\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const published = runCheck(root, { snapshots: { cloud: ['crm.activity.mail.getThread'] } })
    assert.equal(published.status, 0, `stdout:\n${published.stdout}`)

    const absent = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(absent.status, 1, `stdout:\n${absent.stdout}`)
    assert.match(absent.stdout, /"crm\.activity\.mail\.getThread"/)
  })
})

test('a `callMethod(...)` argument is a method position too', () => {
  // v2 by definition, so the version rule rules it out — but it is collected,
  // because a name read in four positions and not the fifth is a blind spot
  // people find by accident.
  withFixture({
    'docs/content/docs/legacy.md': [
      'Under v3 this becomes `actions.v3.call.make`:',
      '',
      '```ts',
      'await b24.callMethod(\'no.such.method\', {})',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /"no\.such\.method" is used as a v3 method \(callMethod argument\)/)
  })
})

test('a malformed snapshot names itself instead of crashing from inside a map', () => {
  withFixture({ 'docs/content/docs/ok.md': '# ok\n' }, (root) => {
    const dir = join(root, 'snapshots')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'openapi-truncated.json'), '{"methods": [{"modul', 'utf8')
    const r = spawnSync(process.execPath, [SCRIPT], {
      env: { ...process.env, V3_CHECK_ROOT: root, V3_SNAPSHOT_DIR: dir },
      encoding: 'utf8'
    })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /openapi-truncated\.json is not valid JSON/)
  })
})

test('the v3 batch tuple is a method position', () => {
  // `calls: { first: ['x.y', {…}] }` — no `method:` key names it, which is why
  // it needs a rule of its own.
  withFixture({
    'docs/content/docs/batch.md': [
      '```ts',
      'await $b24.actions.v3.batch.make({',
      '  calls: { first: [\'no.such.method\', { id: 1 }] }',
      '})',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /"no\.such\.method" is used as a v3 method \(batch tuple\)/)
  })
})

test('a parameter-table row whose first cell is `method` is a method position', () => {
  // The example inside that prose is the first thing a reader copies.
  withFixture({
    'docs/content/docs/table-ver3.md': [
      '| Parameter | Type | Description |',
      '| --- | --- | --- |',
      '| **`method`** | `string` | REST API method name (e.g. `no.such.method`). |',
      '| **`params`** | `object` | Passed through to the portal. |'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /table-ver3\.md:3 "no\.such\.method" is used as a v3 method \(method parameter row\)/)
    // The `params` row is not about the method argument, and `string` is not a
    // method name — neither may be picked up.
    assert.doesNotMatch(r.stdout, /table-ver3\.md:4/)
  })
})

test('the path decides when no fence tag and no nearby call do', () => {
  // Far enough from any `actions.vN.` mention that only the directory answers.
  // The earlier version of this rule matched `v3` as a *substring* of the path,
  // so a directory named `v3-migration-notes/` forced v3 on content about v2 —
  // hence the deliberately awkward directory names below.
  const filler = Array.from({ length: 14 }, (_, i) => ` * filler line ${i}`).join('\n')
  const block = [
    '/**',
    ' * Documentation for the call action.',
    filler,
    ' *     - `method: string` - REST API method name (eg: `no.such.method`)',
    ' */',
    'export class X {}'
  ].join('\n')
  withFixture({
    'packages/jssdk/src/core/actions/v3/call.ts': block,
    'packages/jssdk/src/core/actions/v2/call.ts': block,
    'packages/jssdk/src/v3-migration-notes/legacy.ts': block
  }, (root) => {
    const r = runCheck(root, { snapshots: { cloud: ['tasks.task.get'] } })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /v3\/call\.ts:\d+ "no\.such\.method"/)
    assert.doesNotMatch(r.stdout, /v2\/call\.ts/)
    // A directory that merely *contains* "v3" is not a version decision.
    assert.doesNotMatch(r.stdout, /v3-migration-notes/)
  })
})

test('reduceDocument keeps what the check needs and drops the rest', () => {
  // Exercised here because `--refresh` is a manual step the suite never runs,
  // and this is the function that decides what a committed snapshot contains.
  const reduced = reduceDocument({
    openapi: '3.0.0',
    info: { title: 'Bitrix24 REST V3 API' },
    paths: {
      '/tasks.task.list': { post: {} },
      '/crm.activity.mail.getContent': { post: {}, get: {} },
      '/': {}
    }
  }, 'cloud', new Date('2026-09-05T00:00:00Z'))

  assert.equal(reduced.portalKind, 'cloud')
  assert.equal(reduced.snapshotDate, '2026-09-05')
  assert.equal(reduced.totals.methods, 2)
  assert.deepEqual(reduced.methods.map(m => m.method), ['crm.activity.mail.getContent', 'tasks.task.list'])
  assert.deepEqual(reduced.methods[0].operations, ['get', 'post'])
  // Nothing that could name the portal or its rights comes through.
  const serialised = JSON.stringify(reduced)
  for (const forbidden of ['info', 'title', 'scopes', 'summary', 'servers']) {
    assert.doesNotMatch(serialised, new RegExp(forbidden), `${forbidden} must not survive the reduction`)
  }
})
