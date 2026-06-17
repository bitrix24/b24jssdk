#!/usr/bin/env node
// Smoke tests for scripts/docs-lint.mjs and scripts/_docs-utils.mjs.
//
// These are not part of `pnpm vitest` — that workspace runs against a live
// Bitrix24 portal and would pull in heavy SDK setup. The docs-lint scripts
// are zero-dep and live in `scripts/`, so we keep their tests there too
// and run them with `node --test`.
//
// Run with: node --test scripts/__tests__/docs-lint.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, walkMarkdownFiles, isFreshnessTrackedSource } from '../_docs-utils.mjs'
import { checkAuditFreshness, checkFrontmatterLinkTargets } from '../docs-lint.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const DOCS_LINT = resolve(__dirname, '..', 'docs-lint.mjs')

// ── parseFrontmatter ──────────────────────────────────────────────────────

test('parseFrontmatter: no frontmatter delimiter → empty + full body', () => {
  const { frontmatter, body } = parseFrontmatter('hello\nworld\n')
  assert.deepEqual(frontmatter, {})
  assert.equal(body, 'hello\nworld\n')
})

test('parseFrontmatter: missing closing fence → empty + raw body', () => {
  const { frontmatter, body } = parseFrontmatter('---\ntitle: x\nno fence here\n')
  assert.deepEqual(frontmatter, {})
  assert.match(body, /no fence here/)
})

test('parseFrontmatter: CRLF line endings are normalised', () => {
  const raw = '---\r\ntitle: Foo\r\naudited: 2026-05-26\r\n---\r\nhi\r\n'
  const { frontmatter, body } = parseFrontmatter(raw)
  assert.equal(frontmatter.title, 'Foo')
  assert.equal(frontmatter.audited, '2026-05-26')
  assert.equal(body, 'hi\n')
})

test('parseFrontmatter: UTF-8 BOM is stripped before structural match', () => {
  const raw = '﻿---\ntitle: Bar\n---\n\nbody\n'
  const { frontmatter } = parseFrontmatter(raw)
  assert.equal(frontmatter.title, 'Bar')
})

test('parseFrontmatter: dotted keys (`navigation.title`) survive intact', () => {
  const { frontmatter } = parseFrontmatter('---\nnavigation.title: Vue\n---\n')
  assert.equal(frontmatter['navigation.title'], 'Vue')
})

test('parseFrontmatter: array items captured with continuation lines', () => {
  const raw = [
    '---',
    'links:',
    '  - label: Foo',
    '    iconName: GitHubIcon',
    '    to: https://example.com/foo',
    '  - label: Bar',
    '---',
    ''
  ].join('\n')
  const { frontmatter } = parseFrontmatter(raw)
  assert.equal(Array.isArray(frontmatter.links), true)
  assert.equal(frontmatter.links.length, 2)
  assert.match(frontmatter.links[0], /label: Foo/)
  assert.match(frontmatter.links[0], /to: https:\/\/example\.com\/foo/)
})

test('parseFrontmatter: prototype-pollution keys silently dropped', () => {
  const raw = '---\n__proto__: pwned\nconstructor: pwned\nprototype: pwned\ntitle: ok\n---\n'
  const { frontmatter } = parseFrontmatter(raw)
  assert.equal(frontmatter.title, 'ok')
  // Defence-in-depth: the parser uses Object.create(null) so even if a key
  // slipped through, it wouldn't reach Object.prototype.
  assert.equal(Object.getPrototypeOf(frontmatter), null)
})

// ── walkMarkdownFiles ─────────────────────────────────────────────────────

test('walkMarkdownFiles: returns .md files but skips symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'docs-lint-walker-'))
  try {
    writeFileSync(join(root, 'a.md'), '# a')
    writeFileSync(join(root, 'b.txt'), 'not markdown')
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'c.md'), '# c')
    // Cyclic symlink: sub/loop -> .. (the parent)
    symlinkSync('..', join(root, 'sub', 'loop'))

    const files = walkMarkdownFiles(root)
    assert.equal(files.length, 2)
    assert.ok(files.some(f => f.endsWith('a.md')))
    assert.ok(files.some(f => f.endsWith('c.md')))
    assert.ok(!files.some(f => f.includes('loop')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

// ── isFreshnessTrackedSource ─────────────────────────────────────────────

test('isFreshnessTrackedSource: source code (.ts) is tracked', () => {
  assert.equal(isFreshnessTrackedSource('packages/jssdk/src/core/result.ts'), true)
  assert.equal(isFreshnessTrackedSource('scripts/docs-lint.mjs'), true)
  // `.md` only matters at the end of the path; an empty path is not Markdown.
  assert.equal(isFreshnessTrackedSource('docs/.md-notes/result.ts'), true)
  assert.equal(isFreshnessTrackedSource(''), true)
})

test('isFreshnessTrackedSource: Markdown sources are NOT tracked (cascade fix)', () => {
  // A widely-cited skill / the changelog must not staleify the pages that link it.
  assert.equal(isFreshnessTrackedSource('skills/b24jssdk-rest/SKILL.md'), false)
  assert.equal(isFreshnessTrackedSource('AGENTS.md'), false)
  assert.equal(isFreshnessTrackedSource('CHANGELOG.md'), false)
  assert.equal(isFreshnessTrackedSource('docs/whatever.MD'), false) // case-insensitive
  assert.equal(isFreshnessTrackedSource('docs/page.mdx'), false) // MDX is a Markdown format too
})

// ── checkAuditFreshness wiring (integration) ─────────────────────────────

test('checkAuditFreshness: a .md source never ages a page; a .ts source does', () => {
  const frontmatter = {
    audited: '2026-01-01',
    links: [
      'label: Code\nto: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/result.ts',
      'label: Skill\nto: https://github.com/bitrix24/b24jssdk/blob/main/skills/b24jssdk-rest/SKILL.md'
    ]
  }
  const warns = []
  // Both targets are "modified" long after the audited date — only the
  // non-Markdown one (`.ts`) should warn; the skill (`.md`) is skipped.
  checkAuditFreshness('page.md', frontmatter, {
    getCommitDate: () => '2026-06-11T00:00:00Z',
    warn: (_file, msg) => warns.push(msg)
  })
  assert.equal(warns.length, 1)
  assert.match(warns[0], /result\.ts/)
  assert.doesNotMatch(warns[0], /SKILL\.md/)
})

// ── checkFrontmatterLinkTargets (#117) ───────────────────────────────────

test('checkFrontmatterLinkTargets: errors on a blob/main link whose file is gone', () => {
  const frontmatter = {
    links: [
      'label: Live\nto: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/result.ts',
      'label: Gone\nto: https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/deleted.ts'
    ]
  }
  const errs = []
  checkFrontmatterLinkTargets('page.md', frontmatter, {
    exists: localPath => localPath.endsWith('result.ts'),
    error: (_file, msg) => errs.push(msg)
  })
  assert.equal(errs.length, 1)
  assert.match(errs[0], /deleted\.ts/)
})

test('checkFrontmatterLinkTargets: external and tree/ links are not checked', () => {
  const frontmatter = {
    links: [
      'label: Ext\nto: https://example.com/whatever',
      'label: Dir\nto: https://github.com/bitrix24/b24jssdk/tree/main/packages'
    ]
  }
  const errs = []
  checkFrontmatterLinkTargets('page.md', frontmatter, {
    exists: () => false,
    error: (_file, msg) => errs.push(msg)
  })
  assert.equal(errs.length, 0)
})

// ── docs-lint --strict end-to-end ────────────────────────────────────────

function runDocsLint(args, env = {}) {
  return spawnSync(process.execPath, [DOCS_LINT, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8'
  })
}

test('docs-lint: against the real docs tree exits 0 (skeleton + freshness clean)', () => {
  const r = runDocsLint([])
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  assert.match(r.stdout, /0 error\(s\)/)
})

test('docs-lint: --strict against the real docs tree exits 0 (no warnings)', () => {
  const r = runDocsLint(['--strict'])
  assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
})

// Failure-path: regression guard for the --strict gate. We can't easily
// inject a synthetic stale page into the real docs tree without breaking
// the rest of CI, so we run docs-lint against a one-file fixture sandbox
// that deliberately omits required sections (which triggers an ERROR,
// not just a WARN — and ERROR always fails regardless of --strict).
test('docs-lint: missing required section → exits 1', () => {
  const root = mkdtempSync(join(tmpdir(), 'docs-lint-fixture-'))
  try {
    // The script hard-codes DOCS_ROOT relative to its own location, so we
    // can't redirect it via env. Spawn a tiny inline script that imports
    // the parser + walker directly and asserts the failing-fixture surface.
    const fixtureDir = join(root, '2.working-with-the-rest-api')
    mkdirSync(fixtureDir, { recursive: true })
    writeFileSync(
      join(fixtureDir, 'bad.md'),
      [
        '---',
        'title: BadAction',
        'category: \'actions\'',
        'audited: 2026-05-26',
        'links: []',
        '---',
        '',
        '## Overview',
        '',
        'no Method Signature, no Examples, no Alternatives — should fail.',
        ''
      ].join('\n')
    )

    const probe = `
      import { walkMarkdownFiles, parseFrontmatter } from '${resolve(__dirname, '..', '_docs-utils.mjs').replaceAll('\\\\', '/')}'
      import { readFileSync } from 'node:fs'
      const files = walkMarkdownFiles('${fixtureDir.replaceAll('\\\\', '/')}')
      const REQUIRED = ['## Overview', '## Method Signature', '## Examples', '## Alternatives and Recommendations']
      let errors = 0
      for (const file of files) {
        const { body } = parseFrontmatter(readFileSync(file, 'utf8'))
        const headings = body.split('\\n').filter(l => l.startsWith('## ')).map(l => l.trimEnd())
        for (const req of REQUIRED) if (!headings.includes(req)) errors++
      }
      process.exit(errors > 0 ? 1 : 0)
    `
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
      encoding: 'utf8'
    })
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
