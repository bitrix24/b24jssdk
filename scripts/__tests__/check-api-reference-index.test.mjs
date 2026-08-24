#!/usr/bin/env node
// Fixture tests for scripts/check-api-reference-index.mjs.
//
// The script is the only thing pinning the API Reference index page against the
// code, so its two halves — resolving the value-export surface out of the
// `export * from` barrel chain, and scraping the names the page claims — each
// need to be wrong-proof themselves. A parser that silently under-collects
// would turn the gate into a no-op exactly when it matters.
//
// Run with: node --test scripts/__tests__/check-api-reference-index.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

import { collectValueExports, collectPageNames } from '../check-api-reference-index.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SCRIPT = resolve(__dirname, '..', 'check-api-reference-index.mjs')

function withFixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'api-ref-index-'))
  try {
    for (const [relPath, contents] of Object.entries(files)) {
      const file = join(root, ...relPath.split('/'))
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, contents, 'utf8')
    }
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('collects value declarations and skips type-only ones', () => {
  withFixture({
    'index.ts': [
      'export class Alpha {}',
      'export abstract class Beta {}',
      'export const gamma = 1',
      'export function delta() {}',
      'export async function epsilon() {}',
      'export enum Zeta { A }',
      // must NOT be collected — the page's scope is value exports only.
      'export interface Eta { a: string }',
      'export type Theta = string'
    ].join('\n')
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual(
      [...names].sort(),
      ['Alpha', 'Beta', 'Zeta', 'delta', 'epsilon', 'gamma']
    )
  })
})

test('follows `export * from` through both file and directory barrels', () => {
  withFixture({
    'index.ts': 'export * from \'./leaf\'\nexport * from \'./nested\'\n',
    'leaf.ts': 'export const leafValue = 1\n',
    // a directory barrel — resolved as nested/index.ts
    'nested/index.ts': 'export * from \'./deep\'\n',
    'nested/deep.ts': 'export class Deep {}\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names].sort(), ['Deep', 'leafValue'])
  })
})

test('records the exported name of an aliased re-export, not the local one', () => {
  // `PullClient as B24PullClientManager` in the real barrel: the page must list
  // the name consumers import, so the alias is what counts.
  withFixture({
    'index.ts': 'export { PullClient as B24PullClientManager, Plain } from \'./impl\'\n',
    'impl.ts': 'export class PullClient {}\nexport class Plain {}\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.ok(names.has('B24PullClientManager'))
    assert.ok(names.has('Plain'))
    assert.ok(!names.has('PullClient'), 'the local name is not the public one')
  })
})

test('skips type-only re-export forms', () => {
  withFixture({
    'index.ts': [
      'export type { TypeOnly } from \'./impl\'',
      'export { type Inline, RealValue } from \'./impl\''
    ].join('\n'),
    'impl.ts': 'export class RealValue {}\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['RealValue'])
  })
})

test('survives a cyclic barrel graph', () => {
  withFixture({
    'index.ts': 'export * from \'./a\'\nexport const root = 1\n',
    'a.ts': 'export * from \'./b\'\nexport const a = 1\n',
    'b.ts': 'export * from \'./a\'\nexport const b = 1\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names].sort(), ['a', 'b', 'root'])
  })
})

test('throws — rather than silently under-collecting — on an unresolvable barrel', () => {
  withFixture({
    'index.ts': 'export * from \'./gone\'\n'
  }, (root) => {
    assert.throws(
      () => collectValueExports(join(root, 'index.ts')),
      /cannot resolve/
    )
  })
})

test('rejects `export * as ns` rather than silently skipping it', () => {
  // The form binds a namespace object instead of re-exporting names, so a
  // permissive parser would under-collect and quietly weaken the gate.
  withFixture({
    'index.ts': 'export * as tools from \'./impl\'\n',
    'impl.ts': 'export const inner = 1\n'
  }, (root) => {
    assert.throws(
      () => collectValueExports(join(root, 'index.ts')),
      /export \* as tools/
    )
  })
})

test('ignores `export default` — a default is not re-exported by `export *`', () => {
  withFixture({
    'index.ts': 'export * from \'./impl\'\n',
    'impl.ts': 'export default class FormatterNumbers {}\nexport const named = 1\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['named'])
  })
})

test('reads names from table rows and flat lists, not from prose', () => {
  const names = collectPageNames([
    '| [`Linked`](https://github.com/bitrix24/b24jssdk/blob/main/x.ts) | what | — |',
    '| [Bare](https://github.com/bitrix24/b24jssdk/blob/main/y.ts) | what | — |',
    '',
    '`FlatOne` `FlatTwo`',
    '',
    'Prose mentioning `NotAClaim` and the `isSuccess` flag.'
  ].join('\n'))
  assert.deepEqual([...names].sort(), ['Bare', 'FlatOne', 'FlatTwo', 'Linked'])
  // The point of the restriction: prose backticks are not claims, so a future
  // export named `isSuccess` cannot pass the gate unlisted.
  assert.ok(!names.has('isSuccess'))
  assert.ok(!names.has('NotAClaim'))
})

function runAgainst(root) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      API_REFERENCE_INDEX_ENTRY: join(root, 'index.ts'),
      API_REFERENCE_INDEX_PAGE: join(root, 'page.md')
    }
  })
}

test('fails, naming the export, when the page omits one', () => {
  withFixture({
    'index.ts': 'export class Listed {}\nexport class Forgotten {}\n',
    'page.md': '| [`Listed`](https://github.com/x) | what | — |\n'
  }, (root) => {
    const run = runAgainst(root)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /does not list/)
    assert.match(run.stderr, /- Forgotten/)
  })
})

test('fails, naming the row, when the page lists something no longer exported', () => {
  // The direction a one-way check misses: rename an export and the old row
  // survives beside the new one, with every gate green.
  withFixture({
    'index.ts': 'export class RenamedTo {}\n',
    'page.md': [
      '| [`RenamedTo`](https://github.com/x) | what | — |',
      '| [`RenamedFrom`](https://github.com/x) | stale | — |'
    ].join('\n')
  }, (root) => {
    const run = runAgainst(root)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /not public exports/)
    assert.match(run.stderr, /- RenamedFrom/)
  })
})

test('reports both directions at once', () => {
  withFixture({
    'index.ts': 'export class Added {}\n',
    'page.md': '| [`Removed`](https://github.com/x) | stale | — |\n'
  }, (root) => {
    const run = runAgainst(root)
    assert.equal(run.status, 1)
    assert.match(run.stderr, /- Added/)
    assert.match(run.stderr, /- Removed/)
  })
})

test('the real repo passes, and reports the export count', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /public value export\(s\) — all present/)
})
