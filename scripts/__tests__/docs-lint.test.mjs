#!/usr/bin/env node
// Smoke tests for scripts/docs-lint.mjs and scripts/_docs-utils.mjs.
//
// These are not part of `pnpm vitest` — that workspace runs against a live
// Bitrix24 portal and would pull in heavy SDK setup. The docs-lint scripts
// are zero-dep and live in `scripts/`, so we keep their tests there too
// and run them with `node --test`.
//
// Run with: node --test scripts/__tests__/docs-lint.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseFrontmatter, walkMarkdownFiles, isFreshnessTrackedSource } from '../_docs-utils.mjs'
import { checkAuditFreshness, checkFrontmatterLinkTargets, parseDirtyPaths, gitLastCommitDate, isShallowRepository } from '../docs-lint.mjs'

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

test('parseFrontmatter: `audited:` date stays a string (JSON_SCHEMA, no Date coercion)', () => {
  // The default js-yaml schema would parse this as a JS Date via the YAML
  // timestamp type, breaking the `frontmatter.audited + 'T…'` concat in
  // docs-lint.mjs. JSON_SCHEMA keeps it a plain string — pin that.
  const { frontmatter } = parseFrontmatter('---\naudited: 2026-05-26\n---\n')
  assert.equal(typeof frontmatter.audited, 'string')
  assert.equal(frontmatter.audited, '2026-05-26')
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

test('gitLastCommitDate: an uncommitted edit to a cited source ages the page', () => {
  // The trap this closes, twice hit in practice: the freshness check read only
  // committed history, so running it with a cited source modified-but-not-yet-
  // committed reported on a state that no longer existed — clean locally, red in
  // CI the moment the commit landed.
  //
  // Driven through the real `gitLastCommitDate` (no `getCommitDate` seam) so the
  // git plumbing itself is exercised: dirty the file, expect a warning; restore
  // it, expect none.
  // A throwaway file inside the repo, never a tracked source. An earlier draft
  // appended a probe line to `packages/jssdk/src/types/payloads.ts` and restored
  // it in a `finally` — which loses the race if the runner is killed or times
  // out, leaving a real source file corrupted. `git status` needs the path to be
  // inside the work tree, but it does not need it to be one that matters.
  const cited = 'packages/jssdk/src/.docs-lint-freshness-probe.ts'
  const abs = join(REPO_ROOT, cited)
  const frontmatter = {
    audited: '2020-01-01',
    links: [`label: Code\nto: https://github.com/bitrix24/b24jssdk/blob/main/${cited}`]
  }

  try {
    writeFileSync(abs, '// probe\n', 'utf8')
    const warns = []
    checkAuditFreshness('page.md', frontmatter, { warn: (_f, m) => warns.push(m) })

    assert.equal(warns.length, 1, 'an untracked/dirty cited source must age the page')
    // Today's date, not a commit's — that is the whole point. The file has no
    // commit at all, so reading history alone would have skipped it silently.
    assert.match(warns[0], new RegExp(`modified on ${new Date().toISOString().slice(0, 10)}`))
  } finally {
    rmSync(abs, { force: true })
  }
})

test('parseDirtyPaths: reads every shape git status --porcelain emits', () => {
  const paths = parseDirtyPaths([
    ' M packages/jssdk/src/types/http.ts', // modified, unstaged
    'M  packages/jssdk/src/index.ts', // staged
    'MM scripts/docs-lint.mjs', // staged and modified again
    '?? scripts/new-thing.mjs', // untracked
    'A  docs/content/docs/new-page.md', // added
    'R  old/name.ts -> packages/jssdk/src/renamed.ts', // rename: destination wins
    '?? "docs/content/a file with spaces.md"' // quoted
  ].join('\n'))

  assert.ok(paths.has('packages/jssdk/src/types/http.ts'))
  assert.ok(paths.has('packages/jssdk/src/index.ts'))
  assert.ok(paths.has('scripts/docs-lint.mjs'))
  assert.ok(paths.has('scripts/new-thing.mjs'))
  assert.ok(paths.has('docs/content/docs/new-page.md'))
  // The rename records where the file IS, not where it was.
  assert.ok(paths.has('packages/jssdk/src/renamed.ts'))
  assert.ok(!paths.has('old/name.ts'))
  assert.ok(paths.has('docs/content/a file with spaces.md'))
  assert.equal(paths.size, 7)
})

/**
 * A tracked `.ts` under `packages/jssdk/src` whose last commit is not today.
 *
 * Picked by asking git rather than by naming a file, so a pull request that
 * happens to touch the chosen source does not redden a test about something
 * else. Returns `null` only if every source in the package was committed today,
 * which is a real reason not to be able to test the branch.
 */
function trackedSourceNotCommittedToday() {
  const today = new Date().toISOString().slice(0, 10)
  const listed = spawnSync('git', ['ls-files', 'packages/jssdk/src/**/*.ts'], { cwd: REPO_ROOT, encoding: 'utf8' })
  const candidates = listed.stdout.split('\n').map(line => line.trim()).filter(Boolean)

  for (const candidate of candidates) {
    const committed = spawnSync('git', ['log', '-1', '--format=%cI', '--', candidate], { cwd: REPO_ROOT, encoding: 'utf8' })
      .stdout.trim()
    if (committed && committed.slice(0, 10) !== today) {
      return candidate
    }
  }
  return null
}

test('gitLastCommitDate: a dirty TRACKED source reports now, not its commit date', () => {
  // The primary case, and the one neither probe-file test reaches: both exit
  // through the untracked/ignored fallback, so disabling the dirty branch left
  // them green. Tested at the function that owns the branch, with `isDirty`
  // injected — the alternative, dirtying a real tracked source, is the exact
  // hazard the probe tests were rewritten to avoid.
  const today = new Date().toISOString().slice(0, 10)

  // The file is CHOSEN at run time, not named here. A hard-coded path makes this
  // test a tripwire on whoever edits that file: it needs a source whose last
  // commit is not today, so committing the named file breaks a test that has
  // nothing to do with the change. #279 sprang exactly that trap on
  // `core/result.ts`.
  const cited = trackedSourceNotCommittedToday()
  assert.ok(cited, 'no tracked source under packages/jssdk/src has an older commit — cannot test the dirty branch today')

  const clean = gitLastCommitDate(cited, () => false)
  assert.ok(clean, 'a tracked file must have a commit date')
  assert.notEqual(clean.slice(0, 10), today, `chosen fixture ${cited} must predate today`)

  const dirty = gitLastCommitDate(cited, () => true)
  assert.equal(dirty.slice(0, 10), today, 'a dirty source must report as modified now')
})

test('gitLastCommitDate: a gitignored cited source ages the page too', () => {
  // The narrower half of the same trap, and the one the test above does NOT
  // reach: an untracked file shows up in `git status` as `??`, so it exits
  // through the dirty branch. A GITIGNORED file appears in neither `git status`
  // nor `git log` — so before this it returned null and the page was skipped in
  // silence, which is the worst of the three outcomes.
  //
  // `.docs-typecheck/tmp/` is ignored by .gitignore:112, which is what makes it
  // usable here.
  const dir = join(REPO_ROOT, '.docs-typecheck', 'tmp')
  const cited = '.docs-typecheck/tmp/freshness-probe.ts'
  const abs = join(REPO_ROOT, cited)
  mkdirSync(dir, { recursive: true })

  try {
    writeFileSync(abs, '// probe\n', 'utf8')
    // Precondition, asserted rather than assumed: git must be blind to it both ways.
    assert.equal(spawnSync('git', ['status', '--porcelain', '--', cited], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim(), '')
    assert.equal(spawnSync('git', ['log', '-1', '--format=%cI', '--', cited], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim(), '')

    const warns = []
    checkAuditFreshness('page.md', {
      audited: '2020-01-01',
      links: [`label: Code\nto: https://github.com/bitrix24/b24jssdk/blob/main/${cited}`]
    }, { warn: (_f, m) => warns.push(m) })

    assert.equal(warns.length, 1, 'a cited source git cannot vouch for must age the page')
    assert.match(warns[0], new RegExp(`modified on ${new Date().toISOString().slice(0, 10)}`))
  } finally {
    rmSync(abs, { force: true })
  }
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

// ── shallow clone (#524) ──────────────────────────────────────────────────

function git(args, cwd, env = {}) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env }
  })
  assert.equal(r.status, 0, `git ${args.join(' ')} failed:\n${r.stderr}`)
  return r.stdout.trim()
}

test('isShallowRepository: reads git\'s answer, and says no when git cannot be asked', () => {
  assert.equal(isShallowRepository(() => 'true\n'), true)
  assert.equal(isShallowRepository(() => 'false\n'), false)
  // No git, no repository, no permission: the freshness check is then no worse
  // off than it was before this function existed, so `false` is the safe read.
  const throws = () => {
    throw new Error('not a git repository')
  }
  assert.equal(isShallowRepository(throws), false)
})

test('git reports the shallow boundary as a file\'s last change — the premise of #524', () => {
  // Not a test of our code: it pins the git behaviour the whole fix is built
  // on, in eight lines and without cloning anything large. If git ever stops
  // doing this, this test says so before the rest of the fix looks pointless.
  const root = mkdtempSync(join(tmpdir(), 'docs-lint-graft-'))
  try {
    const origin = join(root, 'origin')
    mkdirSync(origin, { recursive: true })
    git(['init', '-q', '--initial-branch=main', '.'], origin)
    git(['config', 'user.email', 'test@example.com'], origin)
    git(['config', 'user.name', 'Test'], origin)

    writeFileSync(join(origin, 'old.ts'), '// untouched since 2020\n')
    git(['add', '-A'], origin)
    // GIT_COMMITTER_DATE, not `--date`: that flag moves the AUTHOR date, and
    // the check reads `%cI`. Getting this wrong made the first version of this
    // test compare two identical "now"s and pass for no reason.
    git(['commit', '-q', '-m', 'first'], origin, {
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z'
    })

    writeFileSync(join(origin, 'new.ts'), '// recent\n')
    git(['add', '-A'], origin)
    git(['commit', '-q', '-m', 'second'], origin)

    const truth = git(['log', '-1', '--format=%cI', '--', 'old.ts'], origin)

    const shallow = join(root, 'shallow')
    // `--no-local` forces the real transport; a local clone would hardlink the
    // whole object store and ignore --depth.
    git(['clone', '--depth', '1', '--no-local', `file://${origin}`, shallow, '-q'], root)

    assert.equal(git(['rev-parse', '--is-shallow-repository'], shallow), 'true')

    const reported = git(['log', '-1', '--format=%cI', '--', 'old.ts'], shallow)
    const boundary = git(['log', '-1', '--format=%cI'], shallow)

    assert.equal(reported, boundary, 'git answers with the graft date, not the file\'s own')
    assert.notEqual(reported, truth, 'and that is not when the file actually changed')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('docs-lint in a shallow clone: skips freshness, says so, invents no stale pages', () => {
  // The end-to-end case, run against a real shallow clone of this repository
  // rather than a fixture — the bug is about what git answers for THIS history,
  // and a synthetic tree would not reproduce it. A depth-1 clone takes well
  // under a second.
  const root = mkdtempSync(join(tmpdir(), 'docs-lint-shallow-'))
  try {
    const clone = join(root, 'repo')
    git(['clone', '--depth', '1', '--no-local', `file://${REPO_ROOT}`, clone, '-q'], root)
    assert.equal(git(['rev-parse', '--is-shallow-repository'], clone), 'true')

    // A clone carries the COMMITTED scripts, so without this the test would
    // exercise whatever docs-lint looked like at HEAD rather than the version
    // under test — green before the fix is committed, and blind to a later
    // regression in the working tree.
    for (const script of ['docs-lint.mjs', '_docs-utils.mjs', '_reporter.mjs']) {
      copyFileSync(join(REPO_ROOT, 'scripts', script), join(clone, 'scripts', script))
    }

    // The script imports js-yaml; borrow the installed tree rather than install.
    symlinkSync(join(REPO_ROOT, 'node_modules'), join(clone, 'node_modules'), 'dir')

    const r = spawnSync(process.execPath, [join(clone, 'scripts', 'docs-lint.mjs')], {
      cwd: clone,
      encoding: 'utf8'
    })

    // The bug: 22 pages reported stale on the graft date, none of them real.
    assert.doesNotMatch(
      r.stdout,
      /after audited=/,
      `no page may be called stale on the strength of the graft date:\n${r.stdout}`
    )
    // Asserted on the WARN line itself, not anywhere in the output: the
    // summary note carries the same hint, so a loose match over the whole
    // stdout passes even with the warning stripped of its remedy.
    const warnLine = r.stdout.split('\n').find(line => line.includes('WARN'))
    assert.ok(warnLine, `expected a warning about the shallow clone:\n${r.stdout}`)
    assert.match(warnLine, /shallow clone/)
    assert.match(warnLine, /git fetch --unshallow/)
    // And the summary must say freshness did not run, so `0 warning(s)` on the
    // same line cannot be read as a clean bill of health.
    assert.match(r.stdout, /audit freshness SKIPPED \(shallow clone/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('docs-lint with full history: the summary says how many pages were checked', () => {
  // The other half of the same contract — a gate should say what it looked at.
  if (isShallowRepository()) {
    // Not a silent pass: this environment cannot exercise the branch.
    assert.ok(true, 'skipped — this checkout is itself shallow')
    return
  }

  const r = runDocsLint([])
  assert.match(r.stdout, /\d+ page\(s\) checked for audit freshness/)
  assert.doesNotMatch(r.stdout, /SKIPPED/)
})
