#!/usr/bin/env node
// Fixture tests for scripts/docs-link-check.mjs.
//
// Run with: node --test scripts/__tests__/docs-link-check.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const DOCS_LINK_CHECK = resolve(__dirname, '..', 'docs-link-check.mjs')

function writePage(root, relPath, lines) {
  const file = join(root, ...relPath.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
}

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'docs-link-check-'))
  try {
    return run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function runDocsLinkCheck(root) {
  return spawnSync(process.execPath, [DOCS_LINK_CHECK], {
    cwd: REPO_ROOT,
    env: { ...process.env, DOCS_LINK_CHECK_ROOT: root },
    encoding: 'utf8'
  })
}

test('docs-link-check: valid internal pages, index pages, fragments, and frontmatter links pass', () => {
  withFixture((root) => {
    writePage(root, '0.index.md', [
      '---',
      'title: Home',
      'links:',
      '  - label: Guide',
      '    to: /docs/guide/intro/',
      '  - label: External',
      '    to: https://example.com/ignored',
      '---',
      '',
      '# Home',
      '',
      'See [intro](/docs/guide/intro/) and [directory](/docs/directory/).',
      'See [heading](/docs/guide/with-headings/#some-section).',
      'See [duplicate heading](/docs/guide/with-headings/#repeated-1).',
      'External links like [example](https://example.com/no-check) are ignored.',
      'GitHub blob URLs like [source](https://github.com/bitrix24/b24jssdk/blob/main/missing.md) are ignored.'
    ])

    writePage(root, '1.guide/1.intro.md', [
      '---',
      'title: Intro',
      '---',
      '',
      '# Intro'
    ])

    writePage(root, '1.guide/2.with-headings.md', [
      '---',
      'title: Headings',
      '---',
      '',
      '# Page',
      '',
      '## Some Section',
      '',
      '## Repeated',
      '',
      '## Repeated'
    ])

    writePage(root, '2.directory/0.index.md', [
      '---',
      'title: Directory',
      '---',
      '',
      '# Directory'
    ])

    const r = runDocsLinkCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
    assert.match(r.stdout, /1 warning\(s\)/)
  })
})

test('docs-link-check: missing markdown link target exits 1', () => {
  withFixture((root) => {
    writePage(root, '0.index.md', [
      '---',
      'title: Home',
      '---',
      '',
      '# Home',
      '',
      'See [missing](/docs/missing/).'
    ])

    const r = runDocsLinkCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /broken internal link/)
    assert.match(r.stdout, /no matching page/)
  })
})

test('docs-link-check: missing frontmatter link target exits 1', () => {
  withFixture((root) => {
    writePage(root, '0.index.md', [
      '---',
      'title: Home',
      'links:',
      '  - label: Missing',
      '    to: /docs/missing/',
      '---',
      '',
      '# Home'
    ])

    const r = runDocsLinkCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /broken internal link/)
    assert.match(r.stdout, /no matching page/)
  })
})

test('docs-link-check: missing heading fragment exits 1', () => {
  withFixture((root) => {
    writePage(root, '0.index.md', [
      '---',
      'title: Home',
      '---',
      '',
      '# Home',
      '',
      'See [missing heading](/docs/guide/#missing-section).'
    ])

    writePage(root, '1.guide/0.index.md', [
      '---',
      'title: Guide',
      '---',
      '',
      '# Guide',
      '',
      '## Existing Section'
    ])

    const r = runDocsLinkCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /broken fragment/)
    assert.match(r.stdout, /missing-section/)
  })
})
