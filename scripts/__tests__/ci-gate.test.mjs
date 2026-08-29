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
// These tests work in two layers:
//
//   - **structural**, on the parsed YAML: every job in the workflow is named in
//     the gate's `needs`, the gate is `if: always()`, and it does not glob
//     `needs.*` (a wildcard silently accepts a job forgotten in the gate);
//   - **behavioural**: the gate's own `run:` script is extracted from the
//     workflow and executed under bash with synthetic job results, so what is
//     asserted is the exit code for a given scenario rather than the wording of
//     the script. An earlier version matched substrings of the script text and
//     could be broken by renaming a variable, with no behaviour changed.
//
// Run with: node --test scripts/__tests__/ci-gate.test.mjs

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
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

test('ci gate: every job in its needs is carried into the script', () => {
  // A job can be in `needs` — so the gate waits for it — and still never be
  // examined, which is a dependency rather than a check. Asserted against the
  // step's `env` map, which is where the results actually enter the script;
  // whether each one is then judged correctly is covered by the scenarios below.
  const { envToJob } = gateStep()
  const carried = new Set(envToJob.values())
  const unchecked = gate.needs.filter(id => !carried.has(id))
  assert.deepEqual(unchecked, [], `in the gate's needs but never examined: ${unchecked.join(', ')}`)
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

/**
 * The gate's own step, as the workflow defines it: the bash script plus the map
 * from environment variable to the job whose result it carries. Both are read
 * from the YAML rather than restated here, so a rename in the workflow moves
 * the tests with it instead of breaking them.
 */
function gateStep() {
  const step = gate.steps.find(candidate => typeof candidate.run === 'string')
  assert.ok(step, 'the gate has no `run` step to execute')
  const envToJob = new Map()
  for (const [name, expression] of Object.entries(step.env ?? {})) {
    // `${{ needs.prepare.result }}` or `${{ needs['docs-lint'].result }}`
    const match = /needs(?:\.([\w-]+)|\['([^']+)'\])\.result/.exec(String(expression))
    assert.ok(match, `env ${name} is not a needs.<job>.result expression: ${expression}`)
    envToJob.set(name, match[1] ?? match[2])
  }
  return { script: step.run, envToJob }
}

/**
 * Runs the gate exactly as CI would, for one set of job results.
 * `results` maps job id to the result GitHub would report.
 */
function runGate(results) {
  const { script, envToJob } = gateStep()
  const env = { PATH: process.env.PATH }
  for (const [name, job] of envToJob) {
    assert.ok(job in results, `scenario does not say what "${job}" did`)
    env[name] = results[job]
  }
  return spawnSync('bash', ['-c', script], { env, encoding: 'utf8' })
}

/** Every job succeeded — the shape of an ordinary green run. */
function allSuccess(overrides = {}) {
  const results = Object.fromEntries(gate.needs.map(id => [id, 'success']))
  return { ...results, ...overrides }
}

test('ci gate: passes when every job succeeded', () => {
  const run = runGate(allSuccess())
  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`)
})

test('ci gate: passes on a pull request, where deploy is skipped by design', () => {
  // deploy is restricted to a push to main. If this failed, every PR would be
  // red — which is why the skip exception exists at all.
  const run = runGate(allSuccess({ deploy: 'skipped' }))
  assert.equal(run.status, 0, `stdout:\n${run.stdout}\nstderr:\n${run.stderr}`)
})

test('ci gate: FAILS when prepare failed and everything downstream was skipped', () => {
  // #415, reproduced end to end. This is the scenario the old gate passed: a
  // job whose dependency failed reports `skipped`, so there was no `failure`
  // among the gate's needs and it exited 0 having verified nothing.
  const run = runGate({
    'docs-lint': 'success',
    'prepare': 'failure',
    'lint': 'skipped',
    'typecheck': 'skipped',
    'test': 'skipped',
    'build': 'skipped',
    'docs-build': 'skipped',
    'deploy': 'skipped'
  })
  assert.notEqual(run.status, 0, `the gate passed with nothing verified:\n${run.stdout}`)
  assert.match(run.stdout, /PREPARE/)
})

test('ci gate: FAILS for a job that is skipped for any other reason', () => {
  // Not only via prepare: a job skipped by a stray `if:` must not pass either.
  for (const job of gate.needs.filter(id => id !== 'deploy')) {
    const run = runGate(allSuccess({ [job]: 'skipped' }))
    assert.notEqual(run.status, 0, `a skipped "${job}" passed the gate`)
  }
})

test('ci gate: FAILS on a failure, and on a cancellation', () => {
  // `cancelled` is what the old condition caught and this must not lose: a
  // cancelled job has verified nothing either.
  for (const result of ['failure', 'cancelled']) {
    for (const job of gate.needs) {
      const run = runGate(allSuccess({ [job]: result }))
      assert.notEqual(run.status, 0, `"${job}" = ${result} passed the gate`)
    }
  }
})

test('ci gate: FAILS when any single result is missing', () => {
  // An env var the workflow declares but GitHub leaves empty — fail closed.
  //
  // One job at a time, deliberately. Blanking every result at once passes for
  // the wrong reason: the `deploy` branch alone rejects it, so a loop that had
  // stopped checking empties entirely would still look guarded.
  for (const job of gate.needs) {
    const run = runGate(allSuccess({ [job]: '' }))
    assert.notEqual(run.status, 0, `an empty result for "${job}" passed the gate`)
  }
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
