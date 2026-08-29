#!/usr/bin/env node
// Guards the `ci` gate job in .github/workflows/ci.yml (#415).
//
// The gate is the single required status check in branch protection: everything
// else reaches the merge button through it. That makes it the one job where a
// quiet mistake is invisible, because a gate that under-reports is green, and
// nobody looks twice at a green required check.
//
// It was under-reporting. `prepare` was missing from its `needs`, and the
// condition tested only `failure` / `cancelled`. A job whose dependency failed
// is reported **skipped**, not failed — so a broken `prepare` skipped lint,
// typecheck, test, build and docs-build, produced no `failure` anywhere, and
// left the gate green having verified nothing.
//
// These tests pin the two properties that prevent that recurring:
//   1. every job in the workflow is named in the gate's `needs`;
//   2. every job in `needs` is actually checked by the gate's script.
//
// Run with: node --test scripts/__tests__/ci-gate.test.mjs

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import test from 'node:test'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WORKFLOW = resolve(__dirname, '..', '..', '.github', 'workflows', 'ci.yml')

const workflow = load(readFileSync(WORKFLOW, 'utf8'))
const jobs = workflow.jobs
const GATE = 'ci'
const gate = jobs[GATE]

/** The one job allowed to report `skipped`: it only runs on a push to main. */
const MAY_BE_SKIPPED = 'deploy'

function gateScript() {
  return gate.steps.map(step => `${step.run ?? ''}\n${JSON.stringify(step.env ?? {})}`).join('\n')
}

test('ci gate: exists, is the aggregate, and always runs', () => {
  assert.ok(gate, `no "${GATE}" job in ci.yml`)
  // Without `if: always()` the gate is itself skipped when an upstream job
  // fails — which reports as neither success nor failure, and how branch
  // protection treats that is not something to leave to chance.
  assert.equal(String(gate.if).trim(), 'always()', 'the gate must be `if: always()`')
})

test('ci gate: every job in the workflow is in its needs', () => {
  const needs = new Set(gate.needs)
  const missing = Object.keys(jobs).filter(id => id !== GATE && !needs.has(id))
  assert.deepEqual(
    missing,
    [],
    `these jobs can fail without reddening the required check: ${missing.join(', ')}. `
    + 'Add them to the `needs` of the `ci` job and to its script.'
  )
})

test('ci gate: every job in its needs is checked by its script', () => {
  // The failure this catches is a job added to `needs` — so it must finish
  // before the gate runs — but never compared against `success`, which is a
  // dependency rather than a check.
  const script = gateScript()
  for (const id of gate.needs) {
    const token = id.replaceAll('-', '_').toUpperCase()
    assert.ok(
      script.includes(token),
      `job "${id}" is in the gate's needs but its result (${token}) is never examined`
    )
  }
})

test('ci gate: it does not use a needs wildcard', () => {
  // `contains(needs.*.result, …)` reads as thorough and is the opposite: it
  // accepts any job that exists, so a job forgotten in `needs` is silently
  // unguarded — and it cannot express the deploy exception below.
  assert.ok(
    !gateScript().includes('needs.*'),
    'the gate must name each job rather than globbing `needs.*`'
  )
})

test('ci gate: a skipped job fails the gate, except deploy', () => {
  const script = gateScript()
  // The gate must reason in terms of `success`, never in terms of `failure`:
  // comparing against `failure` lets `skipped` through, which is the #415 bug
  // exactly. Asserting the absence of the wrong test rather than the presence
  // of the right one is deliberate — an earlier version of this test looked for
  // `!= "success"` anywhere in the script and was satisfied by the deploy line
  // below, so swapping the loop's comparison to `== "failure"` passed.
  assert.ok(
    !/["']?failure["']?/.test(script),
    'the gate compares against `failure`; it must require `success` instead, '
    + 'or a job skipped because its dependency failed passes the gate'
  )
  assert.ok(
    script.includes('!= "success"'),
    'the gate must require `success` explicitly'
  )
  // deploy is restricted to a push to main, so it is skipped on every PR by
  // design. It gets its own rule rather than weakening the one above.
  assert.ok(
    script.includes(`RESULT_${MAY_BE_SKIPPED.toUpperCase()}`) && script.includes('skipped'),
    `${MAY_BE_SKIPPED} must be allowed to be skipped, explicitly`
  )
})

test('ci gate: deploy is the only job restricted by an `if`', () => {
  // The deploy exception above is only safe while deploy is the only job that
  // can legitimately not run. A second `if`-gated job would silently inherit
  // the strict rule and redden every PR — which is loud, and therefore fine —
  // but a second job added to the skip exception would not be, so this test
  // exists to make anyone adding one come and read this comment.
  const conditional = Object.entries(jobs)
    .filter(([id, job]) => id !== GATE && job.if !== undefined)
    .map(([id]) => id)
  assert.deepEqual(
    conditional,
    [MAY_BE_SKIPPED],
    'a job other than deploy is now conditional — decide whether the gate should '
    + 'treat its `skipped` as a pass, and update MAY_BE_SKIPPED and the gate together'
  )
})
