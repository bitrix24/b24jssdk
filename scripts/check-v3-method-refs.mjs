#!/usr/bin/env node

/**
 * Guards docs / skills / README-AI against drifting from the SDK's real v3 surface (#216).
 *
 * Two layers, both pure static text analysis (no build or portal needed):
 *
 *   1. Phantom v3 actions. `ActionsManagerV3` exposes only
 *      call / callList / fetchList / batch / batchByChunk. Any other
 *      `actions.v3.<x>` — e.g. the `actions.v3.aggregate` that #164 had to walk
 *      back — resolves to `undefined` at runtime, so it is flagged wherever it
 *      appears (dotted or in a `{a,b,c}` list), in prose or code.
 *
 *   2. v3 method whitelist conformance. Inside ```ts / ```typescript fences,
 *      every method passed to a v3 `call`/`callList`/`fetchList` `.make()` must be
 *      on the version-manager v3 allowlist (`#supportMethods`) — otherwise the
 *      snippet throws `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` before any HTTP
 *      request (the #163 class). Obvious placeholders (`some.*`, `your.*`,
 *      `<method>`, …) are skipped, and a `v3-check-ignore` marker on the line above
 *      a fence opts it out — for deliberate "this throws" / anti-pattern examples.
 *
 * The allowlist is parsed straight from the source so it can never go stale.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.V3_CHECK_ROOT
  ? resolve(process.env.V3_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..')

const V3_ACTIONS = new Set(['call', 'callList', 'fetchList', 'batch', 'batchByChunk'])
const REAL_ACTIONS = [...V3_ACTIONS].join(' / ')

// Illustrative, non-real method names that legitimately appear in snippets.
const PLACEHOLDER = /^(?:some|your|my|the|example|any)\.|[<>…*]/

function loadWhitelist() {
  const src = readFileSync(join(ROOT, 'packages/jssdk/src/core/version-manager.ts'), 'utf8')
  const start = src.indexOf('#supportMethods = [')
  if (start === -1) {
    throw new Error('check-v3-method-refs: could not find #supportMethods in version-manager.ts')
  }
  const block = src.slice(start, src.indexOf(']', start))
  const methods = new Set()
  for (const line of block.split('\n')) {
    const code = line.replace(/\/\/.*$/, '') // drop line comments (commented-out entries + `// done`)
    const m = code.match(/'([^']+)'/)
    if (m) {
      methods.add(m[1].replace(/^\//, ''))
    }
  }
  return methods
}

function markdownFiles() {
  const files = [join(ROOT, 'packages', 'jssdk', 'README-AI.md')]
  for (const base of ['docs/content/docs', 'skills']) {
    const dir = join(ROOT, ...base.split('/'))
    const walk = (current) => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.name.endsWith('.md')) {
          files.push(full)
        }
      }
    }
    walk(dir)
  }
  return files
}

const whitelist = loadWhitelist()
let problems = 0

function fail(file, message) {
  console.log(`\x1B[31mV3-DRIFT\x1B[0m ${relative(ROOT, file)}: ${message}`)
  problems += 1
}

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

// Yield the body of every ```ts / ```typescript fence, skipping a fence when the
// nearest non-empty line above it carries a `v3-check-ignore` marker.
function tsFences(body) {
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let inFence = false
  let fenceLen = 0
  let buffer = []
  let skip = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!inFence) {
      const open = line.match(/^(`{3,})(?:ts|typescript)\b/)
      if (!open) {
        continue
      }
      inFence = true
      fenceLen = open[1].length
      buffer = []
      let prev = i - 1
      while (prev >= 0 && lines[prev].trim() === '') {
        prev -= 1
      }
      skip = prev >= 0 && lines[prev].includes('v3-check-ignore')
      continue
    }
    const close = line.match(/^(`{3,})\s*$/)
    if (close && close[1].length >= fenceLen) {
      if (!skip) {
        blocks.push(buffer.join('\n'))
      }
      inFence = false
      buffer = []
      continue
    }
    buffer.push(line)
  }
  return blocks
}

const V3_METHOD_CALL = /actions\.v3\.(call|callList|fetchList)\.make\s*\(\s*\{[\s\S]{0,400}?method:\s*['"]([^'"]+)['"]/g

function checkMethods(file, body) {
  for (const code of tsFences(body)) {
    for (const m of code.matchAll(V3_METHOD_CALL)) {
      const method = m[2]
      if (PLACEHOLDER.test(method) || whitelist.has(method)) {
        continue
      }
      fail(file, `v3 ${m[1]}.make uses method "${method}", which is not on the version-manager v3 whitelist (add a \`v3-check-ignore\` marker above the fence if this is a deliberate anti-pattern example)`)
    }
  }
}

for (const file of markdownFiles()) {
  const body = readFileSync(file, 'utf8')
  checkPhantomActions(file, body)
  checkMethods(file, body)
}

console.log(`\ncheck-v3-method-refs: ${problems} problem(s) across docs, skills, README-AI`)
process.exit(problems > 0 ? 1 : 0)
