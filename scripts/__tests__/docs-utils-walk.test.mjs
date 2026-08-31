// #418 — `walkFiles` is the one directory walk the check scripts share.
//
// Three scripts had written their own, each missing something another had. The
// symlink guard is the reason to share it: a directory symlink pointing at an
// ancestor makes a naive walk recurse forever, which hangs CI rather than
// failing it — and a hung job is diagnosed much later than a red one.
//
// These pin the three behaviours a caller depends on. Without them the guard
// is one refactor away from being dropped as dead code, since nothing in the
// repository has a symlink cycle to notice its absence.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { walkFiles, walkMarkdownFiles } from '../_docs-utils.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'walk-files-'))
  mkdirSync(join(root, 'nested'))
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'top.md'), '#')
  writeFileSync(join(root, 'nested', 'deep.md'), '#')
  writeFileSync(join(root, 'nested', 'page.html'), '<html></html>')
  writeFileSync(join(root, 'node_modules', 'dependency.md'), '#')
  return root
}

test('recurses, and filters by extension', () => {
  const root = fixture()
  try {
    assert.equal(walkFiles(root).filter(f => f.endsWith('.md')).length, 3)
    const html = walkFiles(root, { extension: '.html' })
    assert.equal(html.length, 1)
    assert.equal(html[0], join(root, 'nested', 'page.html'))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('skipDirs keeps the walk out of a nested npm package', () => {
  // `skills/b24jssdk-recipes` is its own package (#65), so its node_modules is
  // inside a tree two scripts walk. Without this they check thousands of
  // dependency READMEs.
  const root = fixture()
  try {
    const found = walkFiles(root, { skipDirs: ['node_modules'] })
    assert.equal(found.length, 2)
    assert.ok(!found.some(f => f.includes('node_modules')))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a directory symlink pointing at an ancestor does not hang the walk', () => {
  const root = fixture()
  try {
    symlinkSync(root, join(root, 'nested', 'loop'))
    // Returns at all — that is the assertion. A naive walk never gets here.
    assert.equal(walkFiles(root, { skipDirs: ['node_modules'] }).length, 2)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('walkMarkdownFiles still means walkFiles with the default extension', () => {
  const root = fixture()
  try {
    assert.deepEqual(walkMarkdownFiles(root), walkFiles(root, { extension: '.md' }))
  } finally { rmSync(root, { recursive: true, force: true }) }
})
