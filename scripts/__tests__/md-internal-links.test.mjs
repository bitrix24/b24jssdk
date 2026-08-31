#!/usr/bin/env node
// Fixture tests for scripts/md-internal-links.mjs.
//
// Run with: node --test scripts/__tests__/md-internal-links.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
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
    // `## Section` is here because the fragment link below now has to name a
    // real heading — before fragment checking, `#section` resolved against a
    // file that had none.
    writeFile(root, 'README.md', ['# Readme', '', '## Section'])
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

test('md-internal-links: a fragment naming no heading exits 1', () => {
  // The quiet failure this catches: the file exists, so the reader lands at the
  // top of the right document with nothing to say they are in the wrong place.
  withFixture((root) => {
    writeFile(root, 'README.md', ['# Readme', '', '## Real Heading'])
    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'See [gone](./README.md#heading-that-was-renamed).'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /no such heading/)
    assert.match(r.stdout, /1 broken link\(s\)/)
  })
})

test('md-internal-links: heading slugs drop punctuation, code ticks and link syntax', () => {
  // Real headings in this repo carry backticks, slashes and colons; the slug has
  // to match what GitHub generates or every such link is a false alarm.
  withFixture((root) => {
    writeFile(root, 'README.md', [
      '# Readme',
      '',
      '## Adding to the Public Surface',
      '',
      '## `AjaxResult` paging helpers are not removed after all',
      '',
      '## Frame, Hook, OAuth',
      '',
      '## See [the guide](./other.md)'
    ])
    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      '[a](./README.md#adding-to-the-public-surface)',
      '[b](./README.md#ajaxresult-paging-helpers-are-not-removed-after-all)',
      '[c](./README.md#frame-hook-oauth)',
      '[d](./README.md#see-the-guide)'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
  })
})

test('md-internal-links: slugs match GitHub on the cases that would be false alarms', () => {
  // Every case here is a link GitHub resolves. Getting any of them wrong fails
  // CI on correct prose, which is far worse than missing a broken link.
  withFixture((root) => {
    writeFile(root, 'README.md', [
      '# Readme',
      '',
      '## Foo & Bar', // punctuation between words: GitHub keeps BOTH spaces
      '',
      '## Привет Мир', // \w is ASCII-only; this must not strip to nothing
      '',
      '## Café Життя', // accented Latin + Cyrillic mixed
      '',
      '## Padded Title   ', // trailing whitespace
      '',
      '## Closing Hashes ##', // ATX closing form
      '',
      '   ## Indented Heading', // up to 3 leading spaces is still a heading
      '',
      'Setext Heading',
      '=============='
    ])
    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      '[a](./README.md#foo--bar)',
      '[b](./README.md#привет-мир)',
      '[c](./README.md#café-життя)',
      '[d](./README.md#padded-title)',
      '[e](./README.md#closing-hashes)',
      '[f](./README.md#indented-heading)',
      '[g](./README.md#setext-heading)',
      '[h](./README.md#Foo--Bar)', // GitHub resolves a mis-cased fragment
      '[i](./README.md#%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82-%D0%BC%D0%B8%D1%80)' // percent-escaped
    ])

    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
  })
})

test('md-internal-links: a tilde fence hides its headings too', () => {
  // The backtick case has its own test below; stripping only backticks would let
  // a `#` line inside a `~~~` block pass as a real anchor.
  withFixture((root) => {
    writeFile(root, 'README.md', [
      '# Readme',
      '',
      '~~~bash',
      '# Not A Heading',
      '~~~'
    ])
    writeFile(root, 'AGENTS.md', ['# Agents', '', '[x](./README.md#not-a-heading).'])

    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /no such heading/)
  })
})

test('md-internal-links: a table rule is not a setext underline, and neither is a bare #', () => {
  withFixture((root) => {
    writeFile(root, 'README.md', [
      '# Readme',
      '',
      '| Col |',
      '| --- |',
      '| v |',
      '',
      '#NoSpaceAfterHash'
    ])
    writeFile(root, 'AGENTS.md', ['# Agents', '', '[x](./README.md#col)'])

    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /no such heading/)
  })
})

test('md-internal-links: a query after the fragment is not part of it', () => {
  withFixture((root) => {
    writeFile(root, 'README.md', ['# Readme', '', '## Section'])
    writeFile(root, 'AGENTS.md', ['# Agents', '', '[x](./README.md#section?v=1)'])

    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
  })
})

test('md-internal-links: a fragment on a non-markdown target is not checked', () => {
  // A `#L42` line anchor on a source file is a GitHub feature, not a heading.
  withFixture((root) => {
    writeFile(root, 'src.ts', ['export const x = 1'])
    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'See [line](./src.ts#L1).'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /0 broken link\(s\)/)
  })
})

test('md-internal-links: a heading inside a code fence is not an anchor', () => {
  // stripCode runs before headings are collected, so a `# comment` line in a
  // shell block cannot satisfy a link.
  withFixture((root) => {
    writeFile(root, 'README.md', [
      '# Readme',
      '',
      '```bash',
      '# Not A Heading',
      '```'
    ])
    writeFile(root, 'AGENTS.md', [
      '# Agents',
      '',
      'See [fenced](./README.md#not-a-heading).'
    ])

    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
    assert.match(r.stdout, /no such heading/)
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

test('SECURITY.md is checked, not just AGENTS.md', () => {
  // The root file list is hand-written, so a new root document is covered only
  // if someone remembers to add it. SECURITY.md points at `redact.ts` and the
  // three lint rules as the defences a reporter should probe — a link rotting
  // there sends someone hunting for a moved file, in the one document that gets
  // read under time pressure.
  withFixture((root) => {
    writeFile(root, 'SECURITY.md', [
      'See [redact](packages/jssdk/src/core/http/redact.ts).',
      'And [gone](packages/jssdk/src/core/http/nope.ts).'
    ])
    writeFile(root, 'packages/jssdk/src/core/http/redact.ts', ['// x'])

    const result = runCheck(root)

    assert.equal(result.status, 1, 'a broken link in SECURITY.md must fail the check')
    assert.match(result.stdout, /SECURITY\.md/)
    assert.match(result.stdout, /nope\.ts/)
  })
})

test('md-internal-links: a fence marker inside an inline span does not unmask a fenced link', () => {
  // #441. `stripCode` removed fenced blocks with an unanchored pattern, so three
  // backticks written inside an inline-code span — the natural way to name a
  // fence in prose — read as a fence opening. The parity of everything after it
  // flips: the real fence below is taken for a *closing* marker, its block is
  // left unstripped, and the illustrative link inside it gets checked.
  //
  // This is how it was found (#440): a false alarm on an ellipsis inside a
  // deliberately abbreviated code sample.
  withFixture((root) => {
    mkDir(root, '.github/contributing')
    writeFile(root, '.github/contributing/guide.md', [
      '# Guide',
      '',
      'Prose naming a `' + '```ts' + '` fence, the way a guide does.',
      '',
      '```ts',
      '/**',
      ' * See [the batch page](…) for the full reference.',
      ' */',
      '```'
    ])

    const result = runCheck(root)

    assert.equal(result.status, 0, `a link inside a fenced block must not be checked:\n${result.stdout}`)
  })
})

test('md-internal-links: the same parity flip does not hide a real broken link', () => {
  // The failure direction that matters, and the reason this is a fix rather
  // than a tidy-up. #440 hit the harmless one — a false alarm, loud and
  // immediate. Put the broken link *between* the inline fence marker and the
  // real fence and the flip swallows it instead: the old strip left
  // `Prose naming a \` ts\ncode\n\`` with the link gone, so the checker passed
  // while the link rotted, and nothing said so.
  withFixture((root) => {
    mkDir(root, '.github/contributing')
    writeFile(root, '.github/contributing/guide.md', [
      '# Guide',
      '',
      'Prose naming a `' + '```ts' + '` fence.',
      '',
      'A [link to a file that is not there](../../packages/jssdk/src/gone.ts).',
      '',
      '```ts',
      'const x = 1',
      '```'
    ])

    const result = runCheck(root)

    assert.equal(result.status, 1, 'the broken link must not be swallowed by the strip')
    assert.match(result.stdout, /gone\.ts/)
  })
})

test('md-internal-links: fences indented inside a list item are still stripped', () => {
  // The fix anchors the fence to a line start, and a naive anchor at column 0
  // would stop stripping fences nested in list items. This repository has them
  // at two, three and six columns.
  withFixture((root) => {
    mkDir(root, '.github/contributing')
    writeFile(root, '.github/contributing/guide.md', [
      '# Guide',
      '',
      '1. A step:',
      '',
      '      ```ts',
      '      // [illustrative](does/not/exist.ts)',
      '      ```',
      '',
      '2. Another step.'
    ])

    const result = runCheck(root)

    assert.equal(result.status, 0, `an indented fenced block must still be stripped:\n${result.stdout}`)
  })
})

test('SECURITY.md exists in the repository', () => {
  // Deliberately not a fixture test: this asserts the real file is there.
  //
  // Everything else here checks a document's CONTENT once it exists. Nothing
  // checked that it does. `targetFiles()` skips a missing path with
  // `existsSync`, `lint:md`'s glob matches nothing, and both exit 0 — so
  // deleting the security policy is invisible to every gate in the repository,
  // which for this particular file is worse than any stale link inside it.
  assert.ok(
    existsSync(join(REPO_ROOT, 'SECURITY.md')),
    'SECURITY.md is the only documented route for reporting a vulnerability privately'
  )
})
