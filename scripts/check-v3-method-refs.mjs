#!/usr/bin/env node

/**
 * Guards docs / skills / README-AI against drifting from the SDK's real v3 surface (#216).
 *
 * Pure static text analysis (no build or portal needed): **phantom v3 actions**.
 * `ActionsManagerV3` exposes only call / callList / fetchList / callTail /
 * fetchTail / batch / batchByChunk. Any other `actions.v3.<x>` — e.g. the
 * `actions.v3.aggregate` that #164 had to walk back — resolves to `undefined` at
 * runtime, so it is flagged wherever it appears (dotted or in a `{a,b,c}` list),
 * in prose or code.
 *
 * NOTE: this script used to also check that v3 method names were on a hardcoded
 * `version-manager` allowlist. That allowlist was removed — the SDK no longer
 * gates v3 by a static list (the server validates method support), so there is
 * nothing to conform to and that layer was dropped.
 */

import { readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkFiles } from './_docs-utils.mjs'
import { createReporter } from './_reporter.mjs'

const ROOT = process.env.V3_CHECK_ROOT
  ? resolve(process.env.V3_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..')

const V3_ACTIONS = new Set(['call', 'callList', 'fetchList', 'callTail', 'fetchTail', 'aggregate', 'batch', 'batchByChunk'])
const REAL_ACTIONS = [...V3_ACTIONS].join(' / ')

function markdownFiles() {
  const files = [join(ROOT, 'packages', 'jssdk', 'README-AI.md')]
  for (const base of ['docs/content/docs', 'skills']) {
    // `skills/b24jssdk-recipes` is its own npm package (#65), so its
    // node_modules sits inside the tree being walked — thousands of dependency
    // READMEs that are not ours to check.
    files.push(...walkFiles(join(ROOT, ...base.split('/')), { skipDirs: ['node_modules'] }))
  }
  return files
}

const report = createReporter({
  label: 'check-v3-method-refs',
  root: ROOT,
  errorNoun: 'problem'
})

const fail = (file, message) => report.error(file, message)

function checkPhantomActions(file, body) {
  for (const m of body.matchAll(/actions\.v3\.([a-zA-Z]\w*)/g)) {
    if (!V3_ACTIONS.has(m[1])) {
      fail(file, `references non-existent v3 action "actions.v3.${m[1]}" — real actions are ${REAL_ACTIONS}`)
    }
  }
  for (const m of body.matchAll(/actions\.v3\.\{([^}]*)\}/g)) {
    for (const name of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
      if (!V3_ACTIONS.has(name)) {
        fail(file, `references non-existent v3 action "${name}" in actions.v3.{${m[1]}}`)
      }
    }
  }
}

for (const file of markdownFiles()) {
  const body = readFileSync(file, 'utf8')
  checkPhantomActions(file, body)
}

report.note('across docs, skills, README-AI')
process.exit(report.finish())
