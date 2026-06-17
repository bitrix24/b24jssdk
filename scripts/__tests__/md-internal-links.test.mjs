#!/usr/bin/env node
// Fixture tests for scripts/md-internal-links.mjs.
//
// Run with: node --test scripts/__tests__/md-internal-links.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const MD_INTERNAL_LINKS = resolve(__dirname, '..', 'md-internal-links.mjs')

function writeFile(root, relPath, lines) {
  const file = join(root, ...relPath.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
}

function mkDir(root, relPath) {
  mkdirSync(join(root, ...relPath.split('/')), { recursive: true })
}

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'md-internal-links-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function runCheck(root) {
  return spawnSync(process.execPath, [MD_INTERNAL_LINKS], {
    cwd: REPO_ROOT,
    env: { ...process.env, MD_INTERNAL_LINKS_ROOT: root },
    encoding: 'utf8'
  })
}

test('md-internal-links: valid links pass; external/absolute/anchor links are skipped', () => {
  withFixture((root) => {
    writeFile(root, 'README.md', ['# Readme'])
    mkDir(root, 'scripts')

    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'See [readme](./README.md) and [scripts dir](./scripts/).',
      'A [fragment](./README.md#section) and a [query](./README.md?v=1) still resolve.',
      'Skipped: [external](https://example.com/x), [route](/docs/y), [anchor](#top).'
    ])

    writeFile(root, '.github/contributing/guide.md', [
      '# Guide',
      '',
      'Up to [readme](../../README.md). External [e](https://x.example) is skipped.'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
    // 4 repo-relative links from AGENTS.md + 1 from guide.md; the rest are skipped.
    assert.match(r.stdout, /5 internal link\(s\) checked/)
  })
})

test('md-internal-links: a missing repo-relative target exits 1', () => {
  withFixture((root) => {
    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'See [missing](./does-not-exist.md).'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /BROKEN/)
    assert.match(r.stdout, /does-not-exist\.md/)
    assert.match(r.stdout, /1 broken link\(s\)/)
  })
})

test('md-internal-links: links inside code fences (incl. nested 4-backtick) are ignored', () => {
  withFixture((root) => {
    writeFile(root, 'README.md', ['# Readme'])

    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'Inline `[fake](./nope-inline.md)` is ignored.',
      '',
      '```md',
      '[fenced](./nope-fenced.md)',
      '```',
      '',
      '````md',
      'A 4-backtick block wrapping a nested fence:',
      '```ts',
      '// [deep](./nope-deep.md)',
      '```',
      '````',
      '',
      'Only [readme](./README.md) is a real link.'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
    // Every fenced/inline link is stripped — only ./README.md is checked.
    assert.match(r.stdout, /1 internal link\(s\) checked/)
  })
})
