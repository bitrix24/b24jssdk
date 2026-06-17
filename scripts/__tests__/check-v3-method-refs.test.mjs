#!/usr/bin/env node
// Fixture tests for scripts/check-v3-method-refs.mjs.
//
// Run with: node --test scripts/__tests__/check-v3-method-refs.test.mjs

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRIPT = resolve(__dirname, '..', 'check-v3-method-refs.mjs')

const WHITELIST_SRC = [
  'class VersionManager {',
  '  this.#supportMethods = [',
  '    \'/tasks.task.get\', // done',
  '    \'/tasks.task.add\',',
  '    // \'/profile\' // wait — commented out, must NOT count',
  '  ]',
  '}'
].join('\n')

function writeFile(root, relPath, content) {
  const file = join(root, ...relPath.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf8')
}

function withFixture(files, run) {
  const root = mkdtempSync(join(tmpdir(), 'v3-refs-'))
  try {
    writeFile(root, 'packages/jssdk/src/core/version-manager.ts', WHITELIST_SRC)
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

function runCheck(root) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, V3_CHECK_ROOT: root },
    encoding: 'utf8'
  })
}

test('clean: real actions, whitelisted method, placeholder, and an ignored anti-pattern all pass', () => {
  withFixture({
    'docs/content/docs/ok.md': [
      '# OK',
      '',
      'Use `actions.v3.call.make` and the `actions.v3.{call,callList,fetchList}` family.',
      '',
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'tasks.task.get\', params: { id: 1 } })',
      'await $b24.actions.v3.call.make({ method: \'some.method\' })',
      '```',
      '',
      '<!-- v3-check-ignore: deliberate "this throws" example -->',
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.deal.add\' })',
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
    'skills/b24jssdk-rest/SKILL.md': 'For v3 counts use `actions.v3.aggregate.make`.\n'
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /non-existent v3 action "actions\.v3\.aggregate"/)
  })
})

test('phantom v3 action inside a {a,b,c} list is flagged', () => {
  withFixture({
    'docs/content/docs/filter.md': 'Used by `actions.v3.{call,callList,aggregate}.make(...)`.\n'
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /non-existent v3 action "aggregate"/)
  })
})

test('non-whitelisted method in a v3 ts fence is flagged', () => {
  withFixture({
    'docs/content/docs/bad.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.deal.add\', params: {} })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /crm\.deal\.add/)
    assert.match(r.stdout, /not on the version-manager v3 whitelist/)
  })
})

test('a non-whitelisted method passed to v2 (not v3) is ignored', () => {
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

test('a commented-out whitelist entry does not count as supported', () => {
  withFixture({
    'docs/content/docs/profile.md': [
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'profile\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 1, `stdout:\n${r.stdout}`)
    assert.match(r.stdout, /profile/)
  })
})

test('v3-check-ignore with a blank line before the fence still suppresses', () => {
  withFixture({
    'docs/content/docs/ignore-gap.md': [
      '<!-- v3-check-ignore: deliberate throw -->',
      '',
      '```ts',
      'await $b24.actions.v3.call.make({ method: \'crm.deal.add\' })',
      '```'
    ].join('\n')
  }, (root) => {
    const r = runCheck(root)
    assert.equal(r.status, 0, `stdout:\n${r.stdout}\nstderr:\n${r.stderr}`)
  })
})
