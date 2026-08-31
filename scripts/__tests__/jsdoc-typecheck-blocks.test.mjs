#!/usr/bin/env node
// Tests for scripts/_extract-jsdoc-examples.mjs and the gate that uses it (#439).
//
// Run with: node --test scripts/__tests__/jsdoc-typecheck-blocks.test.mjs
//
// The compile-and-report half is shared with the docs and skills gates and is
// covered by docs-typecheck.test.mjs. What is specific here is the extractor:
// where an example body starts and ends, which forms are deliberately not code,
// and that a diagnostic still lands on the right source line after the
// presentation fence is unwrapped.

import { existsSync, readdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractJsDocExamples } from '../_extract-jsdoc-examples.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SCRIPT = resolve(__dirname, '..', 'jsdoc-typecheck-blocks.mjs')

const TSC_BIN = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const SDK_TYPES = join(REPO_ROOT, 'packages', 'jssdk', 'dist', 'esm', 'index.d.ts')
const SKIP = !existsSync(TSC_BIN) || !existsSync(SDK_TYPES)

const extract = source => extractJsDocExamples(source, '/fake/file.ts')

test('collects the body after @example and stops at the next tag', () => {
  const blocks = extract([
    '/**',
    ' * Does a thing.',
    ' *',
    ' * @example',
    ' * const a = 1',
    ' * const b = 2',
    ' *',
    ' * @returns {number} the thing',
    ' */',
    'export const thing = 1'
  ].join('\n'))

  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].lines, ['const a = 1', 'const b = 2'])
  // Line 5 of the source, 1-indexed, is `const a = 1`.
  assert.equal(blocks[0].startLine, 5)
})

test('a body that runs to the end of the comment is still collected', () => {
  const blocks = extract([
    '/**',
    ' * @example',
    ' * const a = 1',
    ' */'
  ].join('\n'))

  assert.deepEqual(blocks.map(b => b.lines), [['const a = 1']])
})

test('a same-line @example is a value, not a block', () => {
  // `types/auth.ts` uses this form twelve times to show what a field holds.
  // Compiling `'1xxxxx1694'` on its own proves nothing.
  const blocks = extract([
    '/**',
    ' * @example \'1xxxxx1694\'',
    ' */',
    'export interface X { applicationToken: string }'
  ].join('\n'))

  assert.deepEqual(blocks, [])
})

test('a Markdown fence around the whole body is presentation and is unwrapped', () => {
  // Left in place, ```ts parses as a tagged template and every fenced example
  // fails with the same TS2349 — which is what the first run of the gate saw.
  const blocks = extract([
    '/**',
    ' * @example',
    ' * ```ts',
    ' * const a = 1',
    ' * ```',
    ' */'
  ].join('\n'))

  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].lines, ['const a = 1'])
  // The opening marker is on line 3, so the first code line is line 4.
  assert.equal(blocks[0].startLine, 4)
})

test('an unterminated fence drops its opening marker too', () => {
  // The comment can end before the closing marker does. Keeping the opening
  // line would compile ```ts as a tagged template — the exact TS2349 the
  // unwrap exists to prevent.
  const blocks = extract([
    '/**',
    ' * @example',
    ' * ```ts',
    ' * const a = 1',
    ' */'
  ].join('\n'))

  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].lines, ['const a = 1'])
  assert.equal(blocks[0].startLine, 4)
})

test('a single-line /** ... */ does not leave the scanner inside a comment', () => {
  // It opens and closes on one line. Treated as an opening only, every later
  // line in the file would be read as comment body.
  const blocks = extract([
    '/** One-liner. */',
    'const template = `',
    ' * @example',
    ' * const a: number = \'not a number\'',
    '`',
    '/**',
    ' * @example',
    ' * const real = 1',
    ' */'
  ].join('\n'))

  // Only the genuine example, and none of the template literal that a leaked
  // comment state would have collected as one.
  assert.deepEqual(blocks.map(b => b.lines), [['const real = 1']])
})

test('// @check-ignore skips the block', () => {
  const blocks = extract([
    '/**',
    ' * @example',
    ' * // @check-ignore: pseudo-code for a portal-side handler',
    ' * whatever this is',
    ' */'
  ].join('\n'))

  assert.deepEqual(blocks, [])
})

test('two @example tags in one comment are two blocks', () => {
  const blocks = extract([
    '/**',
    ' * @example',
    ' * const a = 1',
    ' * @example',
    ' * const b = 2',
    ' */'
  ].join('\n'))

  assert.deepEqual(blocks.map(b => b.lines), [['const a = 1'], ['const b = 2']])
})

test('a line comment outside a JSDoc block is not an example', () => {
  const blocks = extract([
    '// @example',
    '// const a = 1',
    'export const x = 1'
  ].join('\n'))

  assert.deepEqual(blocks, [])
})

test('the gate walks the SDK source, not a hand-written list', () => {
  const source = readFileSync(SCRIPT, 'utf8')
  assert.match(source, /walkFiles\(join\(REPO_ROOT, 'packages', 'jssdk', 'src'\)/)
  assert.match(source, /extension: '\.ts'/)
})

test('the SDK source has examples for the gate to find', { skip: SKIP }, () => {
  // An empty sweep is treated as failure by checkBlocks; this asserts the
  // premise separately, so a broken path is distinguishable from a clean tree.
  const files = readdirSync(join(REPO_ROOT, 'packages', 'jssdk', 'src'))
  assert.ok(files.length > 0, 'packages/jssdk/src is empty — the layout changed')
})

test('a deliberate type error in an @example fails the gate', { skip: SKIP }, () => {
  // Verified by injection rather than inspection: the acceptance criterion of
  // #439 is that a broken example cannot reach main, and the only proof of that
  // is watching a broken one fail.
  const target = join(REPO_ROOT, 'packages', 'jssdk', 'src', 'tools', 'index.ts')
  const original = readFileSync(target, 'utf8')
  const marker = ' * const result = getEnumValue('
  assert.ok(original.includes(marker), 'the example this test injects into moved')

  try {
    writeFileSync(
      target,
      original.replace(marker, ' * const injected: number = \'not a number\'\n' + marker),
      'utf8'
    )
    const run = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(run.status, 1, 'the gate passed on an example that does not compile')
    assert.match(run.stdout, /tools\/index\.ts:\d+:\d+ TS2322/)
  } finally {
    writeFileSync(target, original, 'utf8')
  }
})
