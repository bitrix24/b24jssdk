#!/usr/bin/env node

/**
 * Guards docs / skills / README-AI / SDK source against drifting from the
 * portal's real v3 surface. Two layers, both pure static text analysis.
 *
 * **Phantom v3 actions** (#216). `ActionsManagerV3` exposes only call /
 * callList / fetchList / callTail / fetchTail / batch / batchByChunk. Any other
 * `actions.v3.<x>` — e.g. the `actions.v3.aggregate` that #164 had to walk back
 * — resolves to `undefined` at runtime, so it is flagged wherever it appears.
 *
 * **Phantom v3 method names** (#463). This is the layer the old NOTE here said
 * had been dropped with the hardcoded `version-manager` allowlist. It is back,
 * and deliberately not as a list: the names are held against a **snapshot of a
 * portal's own OpenAPI document**, committed under `scripts/data/`. A name used
 * in a v3 method position and published by no snapshot fails with `file:line`.
 *
 * Three properties of that design are load-bearing, and each is a decision:
 *
 *  - **A snapshot is a baseline, not a catalogue.** No two measured portals
 *    publish the same surface — 147 on-premise, 245 and 220 on two cloud
 *    portals, which disagree with each other. So a name present in *one*
 *    snapshot is accepted, and a portal method we never document is never a
 *    failure. A check that is red by design gets switched off.
 *  - **It audits prose, never runtime.** `b24pysdk` keeps a 70-name list and
 *    silently downgrades an unlisted v3 call to v2; the on-premise build
 *    publishes 81 names it does not know, and 4 of its own exist on no portal
 *    at all. That is the mistake this must not repeat.
 *  - **It never calls a portal.** Refreshing a snapshot is a local step
 *    (`--refresh`), like the rest of this repository's portal work.
 *
 * Deliberate anti-examples are marked, not special-cased: `@check-ignore` on the
 * line or the line before, the same escape hatch the fence gates use.
 *
 * `--coverage` prints what the snapshots hold against what the repository
 * documents, and always exits 0. That is the number a docs PR cites.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkFiles } from './_docs-utils.mjs'
import { createReporter } from './_reporter.mjs'
import { collectMethodPositions, versionContextAt } from './_v3-method-positions.mjs'

const ROOT = process.env.V3_CHECK_ROOT
  ? resolve(process.env.V3_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SNAPSHOT_DIR = process.env.V3_SNAPSHOT_DIR
  ? resolve(process.env.V3_SNAPSHOT_DIR)
  : join(ROOT, 'scripts', 'data')

const V3_ACTIONS = new Set(['call', 'callList', 'fetchList', 'callTail', 'fetchTail', 'aggregate', 'batch', 'batchByChunk'])
const REAL_ACTIONS = [...V3_ACTIONS].join(' / ')

const args = new Set(process.argv.slice(2))
const wantCoverage = args.has('--coverage')
const wantRefresh = args.has('--refresh')

/**
 * The files worth walking, and why each is in the list.
 *
 * `packages/jssdk/src/` joined the walk for #463: five of the eight method-name
 * defects found by the v3 audit were JSDoc, not documentation. `.md` and `.ts`
 * are read the same way — the positions that count are syntactic, not
 * per-language.
 */
function filesToCheck() {
  const files = [join(ROOT, 'packages', 'jssdk', 'README-AI.md')]
  for (const base of ['docs/content/docs', 'skills']) {
    // `skills/b24jssdk-recipes` is its own npm package (#65), so its
    // node_modules sits inside the tree being walked — thousands of dependency
    // READMEs that are not ours to check.
    files.push(...walkFiles(join(ROOT, ...base.split('/')), { skipDirs: ['node_modules'] }))
  }
  // Tolerated as absent so a fixture root can populate only what it is testing;
  // `pullClient` is skipped because its vendored protobuf modules are not ours.
  const sdkSource = join(ROOT, 'packages', 'jssdk', 'src')
  if (existsSync(sdkSource)) {
    files.push(...walkFiles(sdkSource, { extension: '.ts', skipDirs: ['node_modules', 'pullClient'] }))
  }
  return files
}

/**
 * Load every committed snapshot.
 *
 * Returns `[]` when the directory is empty, and the caller treats that as
 * "cannot judge" rather than "nothing is published" — the difference between a
 * check that is quiet because everything is fine and one that is quiet because
 * it has nothing to compare against. The second must say so out loud.
 */
export function loadSnapshots(dir = SNAPSHOT_DIR) {
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir)
    .filter(name => name.startsWith('openapi-') && name.endsWith('.json'))
    .sort()
    .map((name) => {
      const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'))
      return { name, methods: new Set(parsed.methods.map(m => m.method)), raw: parsed }
    })
}

/**
 * The opening fence enclosing `index`, or `-1`.
 *
 * Same walk `versionContextAt` does, kept here because the marker convention and
 * the version convention answer different questions about the same fence.
 */
function enclosingFenceStart(lines, index) {
  let open = -1
  for (let i = 0; i <= index; i++) {
    if (/^\s*`{3,}/.test(lines[i])) {
      open = open === -1 ? i : -1
    }
  }
  return open
}

/**
 * Is this occurrence deliberately exempt?
 *
 * The marker is the repository's existing `// @check-ignore: <reason>` rather
 * than a new vocabulary — on the line, the line above, or the nearest non-empty
 * line *before the enclosing fence*, which is where the typecheck gates look
 * (`_typecheck-blocks.mjs`). One marker per example beats one per line.
 *
 * **The reason must name the method.** That is not decoration. Two fences in
 * the docs already carried `// @check-ignore: top-level return in
 * error-handling illustration` — written for the typecheck gate, about
 * something else entirely — and a marker shared between checks would have let
 * an exemption granted for one silently grant the other. Naming the method
 * makes every exemption specific to the thing it excuses, so a marker cannot
 * acquire a second meaning by sitting in the right place.
 */
function isMarkedIgnored(lines, index, name) {
  const names = line => line.includes('@check-ignore') && line.includes(name)

  const here = lines[index] ?? ''
  const above = index > 0 ? lines[index - 1] : ''
  if (names(here) || names(above)) {
    return true
  }

  const fence = enclosingFenceStart(lines, index)
  if (fence === -1) {
    return false
  }
  let prev = fence - 1
  while (prev >= 0 && lines[prev].trim() === '') {
    prev--
  }
  return prev >= 0 && lines[prev].trim().startsWith('// @check-ignore') && lines[prev].includes(name)
}

const report = createReporter({
  label: 'check-v3-method-refs',
  root: ROOT,
  errorNoun: 'problem'
})

function checkPhantomActions(file, body) {
  for (const m of body.matchAll(/actions\.v3\.([a-zA-Z]\w*)/g)) {
    if (!V3_ACTIONS.has(m[1])) {
      report.error(file, `references non-existent v3 action "actions.v3.${m[1]}" — real actions are ${REAL_ACTIONS}`)
    }
  }
  for (const m of body.matchAll(/actions\.v3\.\{([^}]*)\}/g)) {
    for (const name of m[1].split(',').map(s => s.trim()).filter(Boolean)) {
      if (!V3_ACTIONS.has(name)) {
        report.error(file, `references non-existent v3 action "${name}" in actions.v3.{${m[1]}}`)
      }
    }
  }
}

/**
 * Hold every v3 method position against the snapshots.
 *
 * Every name seen in a v3 position is added to `documented`, whether or not a
 * snapshot publishes it — that set is what the coverage report joins against.
 */
function checkMethodNames(file, body, snapshots, documented) {
  const lines = body.split(/\r\n?|\n/)
  for (const hit of collectMethodPositions(body)) {
    if (versionContextAt(file, lines, hit.line - 1) !== 'v3') {
      continue
    }
    documented.add(hit.name)
    if (snapshots.length === 0 || isMarkedIgnored(lines, hit.line - 1, hit.name)) {
      continue
    }
    const publishedBy = snapshots.filter(s => s.methods.has(hit.name))
    if (publishedBy.length === 0) {
      report.error(
        file,
        `"${hit.name}" is used as a v3 method (${hit.position}) but no portal snapshot publishes it — `
        + `fix the name, or mark the line "@check-ignore: <reason>" if it is a deliberate anti-example`,
        { line: hit.line }
      )
    }
  }
}

async function refresh() {
  const hook = process.env.B24_HOOK
  if (!hook) {
    console.error('--refresh needs B24_HOOK (a webhook URL) in the environment. It is never read in CI and never committed.')
    process.exit(2)
  }
  const kind = process.env.V3_SNAPSHOT_KIND
  if (!kind || !/^[a-z0-9-]+$/.test(kind)) {
    console.error('--refresh needs V3_SNAPSHOT_KIND — the portal *kind* (e.g. "cloud", "on-premise"), never a domain.')
    process.exit(2)
  }

  // A plain POST rather than the SDK. Every other script in `scripts/` is
  // dependency-free node, and importing the package source here would pull the
  // Pull client's protobuf modules into a lint script that has no use for them.
  // The endpoint is one unauthenticated-by-header call: the webhook URL *is* the
  // credential, which is exactly why it never leaves this local step.
  // `restApi:v3` puts the hook at /rest/api/<userId>/<secret>/, not
  // /rest/<userId>/<secret>/ — the `api/` segment goes *before* the user id, and
  // appending it after the secret answers 404. Same shape the log redactor
  // masks, read from `hook/auth.ts`.
  const v3Base = hook.replace(/\/rest\/(\d+\/)/, '/rest/api/$1')
  if (v3Base === hook && !hook.includes('/rest/api/')) {
    console.error('B24_HOOK does not look like a Bitrix24 webhook URL (/rest/<userId>/<secret>/)')
    process.exit(2)
  }
  const base = v3Base.endsWith('/') ? v3Base : `${v3Base}/`
  const response = await fetch(`${base}rest.documentation.openapi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  if (!response.ok) {
    // Deliberately without the body or the URL: both can carry the secret.
    console.error(`portal refused with HTTP ${response.status}`)
    process.exit(1)
  }

  const document = await response.json()
  if (typeof document?.paths !== 'object') {
    console.error('the response carried no `paths` — not an OpenAPI document')
    process.exit(1)
  }

  const written = writeSnapshot(document, kind)
  console.log(`wrote ${written.file} — ${written.totals.methods} methods across ${written.totals.modules} modules`)
}

/**
 * Reduce the portal document to what the check needs, and nothing else.
 *
 * The document on the wire is ~140 KB on-premise and ~215 KB in the cloud, its
 * `summary` fields are Russian, and it is not ours to republish. What is kept is
 * the method name, its module and its operations — enough to answer "does this
 * portal publish this name" and to print coverage per module.
 *
 * What is deliberately dropped: `summary` (the Russian half), the scopes the
 * token held, and anything naming the portal. A snapshot carries a portal
 * kind*, never an identity and never a credential.
 */
export function reduceDocument(document, kind, today = new Date()) {
  const methods = []
  for (const [path, operations] of Object.entries(document.paths ?? {})) {
    const method = path.replace(/^\//, '')
    if (method === '') {
      continue
    }
    methods.push({
      method,
      module: method.split('.')[0],
      operations: Object.keys(operations ?? {}).sort()
    })
  }
  methods.sort((a, b) => a.method.localeCompare(b.method))

  const methodsPerModule = {}
  for (const { module } of methods) {
    methodsPerModule[module] = (methodsPerModule[module] ?? 0) + 1
  }

  return {
    portalKind: kind,
    snapshotDate: today.toISOString().slice(0, 10),
    openapi: document.openapi ?? null,
    totals: { methods: methods.length, modules: Object.keys(methodsPerModule).length },
    methodsPerModule,
    methods
  }
}

function writeSnapshot(document, kind) {
  const reduced = reduceDocument(document, kind)
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const file = join(SNAPSHOT_DIR, `openapi-${kind}-${reduced.snapshotDate}.json`)
  writeFileSync(file, `${JSON.stringify(reduced, null, 2)}\n`)
  return { file: basename(file), totals: reduced.totals }
}

function printCoverage(snapshots, documented) {
  if (snapshots.length === 0) {
    console.log('coverage: no snapshot committed under scripts/data/ — run with --refresh against a portal.')
    return
  }
  console.log('v3 method coverage — portal snapshots against what this repository documents\n')
  for (const snapshot of snapshots) {
    const published = snapshot.raw.methods
    const covered = published.filter(m => documented.has(m.method))
    console.log(`${snapshot.name}  (${snapshot.raw.portalKind}, ${snapshot.raw.snapshotDate})`)
    console.log(`  publishes ${published.length}, documented here ${covered.length}, never named ${published.length - covered.length}`)
    const perModule = {}
    for (const m of published) {
      perModule[m.module] ??= { total: 0, covered: 0 }
      perModule[m.module].total++
      if (documented.has(m.method)) {
        perModule[m.module].covered++
      }
    }
    for (const [module, { total, covered: hit }] of Object.entries(perModule).sort()) {
      console.log(`    ${module.padEnd(18)} ${String(hit).padStart(3)} / ${total}`)
    }
    console.log('')
  }
  const unpublished = [...documented].filter(name => !snapshots.some(s => s.methods.has(name))).sort()
  console.log(`named here in a v3 position: ${documented.size}`)
  if (unpublished.length > 0) {
    console.log(`named here but published by no snapshot: ${unpublished.length} — ${unpublished.join(', ')}`)
  }
}

if (wantRefresh) {
  await refresh()
} else {
  const snapshots = loadSnapshots()
  const documented = new Set()

  for (const file of filesToCheck()) {
    const body = readFileSync(file, 'utf8')
    checkPhantomActions(file, body)
    checkMethodNames(file, body, snapshots, documented)
  }

  if (wantCoverage) {
    printCoverage(snapshots, documented)
    process.exit(0)
  }

  if (snapshots.length === 0) {
    report.note('no portal snapshot under scripts/data/ — method names unchecked; run --refresh locally')
  }
  report.note(`across docs, skills, README-AI, packages/jssdk/src (${snapshots.length} snapshot(s))`)
  process.exit(report.finish())
}
