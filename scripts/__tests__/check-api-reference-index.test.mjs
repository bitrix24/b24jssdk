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

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectValueExports,
  collectPageNames,
  collectPagePositions,
  checkListConsistency,
  checkPositionSplit
} from '../check-api-reference-index.mjs'

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

test('a bare re-export of a type-only name is not counted as a value', () => {
  // `export { Foo } from './impl'` carries no `type` marker even when the target
  // declares `Foo` as a type. Trusting the re-export site would force the page
  // to list a name no consumer can import at runtime.
  withFixture({
    'index.ts': 'export { OnlyType, RealClass } from \'./impl\'\n',
    'impl.ts': 'export type OnlyType = string\nexport class RealClass {}\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['RealClass'])
  })
})

test('an aliased re-export is checked against the target under its LOCAL name', () => {
  withFixture({
    'index.ts': 'export { PullClient as B24PullClientManager } from \'./impl\'\n',
    'impl.ts': 'export class PullClient {}\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['B24PullClientManager'])
  })
})

test('a declaration inside a comment or template literal is not an export', () => {
  // This codebase writes doc examples at column zero inside JSDoc blocks, so a
  // line-anchored match would collect them and fail the page for not listing a
  // name that does not exist.
  withFixture({
    'index.ts': [
      '/**',
      ' * @example',
      'export const documentedButNotReal = 1',
      ' */',
      '// export const commentedOut = 2',
      'const snippet = `',
      'export const insideATemplate = 3',
      '`',
      'export const real = 4'
    ].join('\n')
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['real'])
  })
})

test('rejects a multi-declarator export rather than dropping the later names', () => {
  // `export const a = 1, b = 2` binds two names; the declaration regex sees only
  // the first. Silently losing `b` is the one failure mode a completeness gate
  // must not have, so the walk refuses the form.
  withFixture({
    'index.ts': 'export const first = 1, second = 2\n'
  }, (root) => {
    assert.throws(
      () => collectValueExports(join(root, 'index.ts')),
      /multi-declarator export is not supported/
    )
  })
})

test('a generic type annotation is not mistaken for a multi-declarator', () => {
  // The real `export const StatusDescriptions: Record<Status, string> = {` in
  // types/b24-helper.ts — the comma sits inside angle brackets, not between
  // declarators. A false alarm here would redden CI over correct code.
  withFixture({
    'index.ts': [
      'export const StatusDescriptions: Record<Status, string> = {',
      '  F: \'Free\',',
      '  D: \'Demo\'',
      '}'
    ].join('\n')
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['StatusDescriptions'])
  })
})

test('a multi-line object initializer does not trip the multi-declarator guard', () => {
  withFixture({
    'index.ts': 'export const config = {\n  a: 1,\n  b: 2\n}\n'
  }, (root) => {
    const names = collectValueExports(join(root, 'index.ts'))
    assert.deepEqual([...names], ['config'])
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
    assert.match(run.stdout, /does not list/)
    assert.match(run.stdout, /- Forgotten/)
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
    assert.match(run.stdout, /not public exports/)
    assert.match(run.stdout, /- RenamedFrom/)
  })
})

test('reports both directions at once', () => {
  withFixture({
    'index.ts': 'export class Added {}\n',
    'page.md': '| [`Removed`](https://github.com/x) | stale | — |\n'
  }, (root) => {
    const run = runAgainst(root)
    assert.equal(run.status, 1)
    assert.match(run.stdout, /- Added/)
    assert.match(run.stdout, /- Removed/)
  })
})

test('the real repo passes, and reports the export count', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /0 error\(s\), 0 warning\(s\), \d+ public value export\(s\)/)
})

// ── list consistency (#384) ──────────────────────────────────────────────
//
// The #383 gate holds the page against the code and is deliberately scoped to
// the union of positions on the page. These check the page against itself,
// which is the drift that gate cannot see: "Not yet covered by a guide" is
// designed to shrink, and shrinking is the one operation nothing watched.

const page = body => `---
title: API Reference
---

${body}
`

test('reads a table row guide cell as linked or not', () => {
  const { rows } = collectPagePositions(page([
    '## Entry points',
    '',
    '| Export | What it is | Guide |',
    '| --- | --- | --- |',
    '| [`B24Hook`](https://example.test/hook.ts) | Webhook auth. | [guide](/docs/hook/) |',
    '| [`versionManager`](https://example.test/vm.ts) | Routing. | — |'
  ].join('\n')))

  assert.equal(rows.get('B24Hook'), true)
  assert.equal(rows.get('versionManager'), false)
})

test('attributes a flat list to the heading above it', () => {
  const { everythingElse, uncovered } = collectPagePositions(page([
    '## Everything else',
    '',
    '`AppFrame` `LsKeys`',
    '',
    '## Not yet covered by a guide',
    '',
    '`AppFrame` `versionManager`'
  ].join('\n')))

  assert.deepEqual([...everythingElse], ['AppFrame', 'LsKeys'])
  assert.deepEqual([...uncovered], ['AppFrame', 'versionManager'])
})

test('a name in both flat lists is fine — they are different questions', () => {
  // "Everything else" is about having a row on this page; "Not yet covered" is
  // about having a guide elsewhere. No row and no guide is a legitimate pair,
  // and it describes nineteen names on the real page. A check forbidding it was
  // written first, and this test is what the correction looks like.
  const positions = collectPagePositions(page([
    '## Everything else',
    '',
    '`AppFrame`',
    '',
    '## Not yet covered by a guide',
    '',
    '`AppFrame`'
  ].join('\n')))

  assert.deepEqual(checkListConsistency(positions), [])
})

test('fails when a name with a guide link is still listed as uncovered', () => {
  // The drift this whole issue is about: the guide gets written, the row gets
  // its link, and nobody remembers to delete the name from the list below.
  const positions = collectPagePositions(page([
    '## Tools',
    '',
    '| [`LsKeys`](https://example.test/ls.ts) | Storage keys. | [guide](/docs/ls-keys/) |',
    '',
    '## Not yet covered by a guide',
    '',
    '`LsKeys`'
  ].join('\n')))

  const problems = checkListConsistency(positions)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /whose table row links to one/)
  assert.match(problems[0], /LsKeys/)
})

test('passes when the row still says the guide is missing', () => {
  const positions = collectPagePositions(page([
    '## Tools',
    '',
    '| [`LsKeys`](https://example.test/ls.ts) | Storage keys. | — |',
    '',
    '## Not yet covered by a guide',
    '',
    '`LsKeys`'
  ].join('\n')))

  assert.deepEqual(checkListConsistency(positions), [])
})

test('fails when a name has a row and is also in "Everything else"', () => {
  const positions = collectPagePositions(page([
    '## Tools',
    '',
    '| [`LsKeys`](https://example.test/ls.ts) | Storage keys. | — |',
    '',
    '## Everything else',
    '',
    '`LsKeys`'
  ].join('\n')))

  const problems = checkListConsistency(positions)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /in both a domain table and "Everything else"/)
})

test('fails when an export appears only under "Not yet covered by a guide"', () => {
  // That list records a missing guide, not a place on this page — so a name
  // listed there and nowhere else is absent from the index proper.
  const positions = collectPagePositions(page([
    '## Not yet covered by a guide',
    '',
    '`LsKeys`'
  ].join('\n')))

  const problems = checkPositionSplit(new Set(['LsKeys']), positions)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /in neither a domain table nor "Everything else"/)
})

test('the real page satisfies both consistency checks', () => {
  const markdown = readFileSync(
    join(REPO_ROOT, 'docs/content/docs/3.api-reference/1.index.md'),
    'utf8'
  )
  const positions = collectPagePositions(markdown)

  assert.deepEqual(checkListConsistency(positions), [])
  const entry = join(REPO_ROOT, 'packages/jssdk/src/index.ts')
  assert.deepEqual(checkPositionSplit(collectValueExports(entry), positions), [])
})
