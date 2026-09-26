#!/usr/bin/env node

/**
 * Guards docs / skills / README-AI / SDK source against drifting from the
 * portal's real v3 surface. Two layers, both pure static text analysis.
 *
 * **Phantom v3 actions** (#216). `ActionsManagerV3` exposes only call /
 * callList / fetchList / callTail / fetchTail / aggregate / batch /
 * batchByChunk / deferredBatch. Any other `actions.v3.<x>` resolves to
 * `undefined` at runtime, so it is flagged wherever it appears. (#164 once
 * had to walk back an `actions.v3.aggregate` that did not exist then.)
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
import { fileURLToPath, pathToFileURL } from 'node:url'
import { walkFiles } from './_docs-utils.mjs'
import { createReporter } from './_reporter.mjs'
import { collectMethodPositions, versionContextAt } from './_v3-method-positions.mjs'

const ROOT = process.env.V3_CHECK_ROOT
  ? resolve(process.env.V3_CHECK_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SNAPSHOT_DIR = process.env.V3_SNAPSHOT_DIR
  ? resolve(process.env.V3_SNAPSHOT_DIR)
  : join(ROOT, 'scripts', 'data')

const V3_ACTIONS = new Set(['call', 'callList', 'fetchList', 'callTail', 'fetchTail', 'aggregate', 'batch', 'batchByChunk', 'deferredBatch'])
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
  // The recipes are runnable TypeScript, not prose, and were invisible to every
  // v3 gate while only `.md` was walked here — which is how two of them shipped
  // calling `tasks.task.add` on v3 with v2 field names and reading the v2
  // result key (#476). They are the files most likely to carry the mistake,
  // because they are the ones people copy.
  files.push(...walkFiles(join(ROOT, 'skills'), { extension: '.ts', skipDirs: ['node_modules'] }))
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
      // Validated rather than trusted: `--refresh` is the only writer, but a run
      // interrupted mid-write leaves a truncated file, and the failure that
      // produced was an undefined `.map` deep inside module load with nothing
      // naming the file.
      let parsed
      try {
        parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'))
      } catch (error) {
        throw new Error(`snapshot ${name} is not valid JSON — re-run --refresh`, { cause: error })
      }
      if (!Array.isArray(parsed.methods) || parsed.methods.some(m => typeof m?.method !== 'string')) {
        throw new Error(`snapshot ${name} has no usable "methods" array — re-run --refresh`)
      }
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
    if (/^\s*(?:`{3,}|~{3,})/.test(lines[i])) {
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

  // In a source file there is no fence, and the marker cannot sit next to the
  // line either: inside a JSDoc `@example` it would render on hover as if it
  // were part of the example an SDK consumer is meant to copy. So a marker
  // anywhere in the enclosing JSDoc block exempts that block, which is also how
  // a reader would expect a block annotation to behave.
  const fence = enclosingFenceStart(lines, index)
  if (fence === -1) {
    for (let i = index - 1; i >= 0; i--) {
      const text = lines[i].trim()
      if (names(text)) {
        return true
      }
      if (text.startsWith('/**')) {
        return false
      }
      if (!text.startsWith('*')) {
        return false
      }
    }
    return false
  }
  let prev = fence - 1
  while (prev >= 0 && lines[prev].trim() === '') {
    prev--
  }
  if (prev < 0) {
    return false
  }
  // `.replace(/^\*\s*/, '')` because inside a JSDoc block the marker line reads
  // `* // @check-ignore: …` — without it the fence form silently never matched
  // in TypeScript, and only the line-above form worked there.
  const marker = lines[prev].trim().replace(/^\*\s*/, '')
  return marker.startsWith('// @check-ignore') && marker.includes(name)
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
 * The v3 endpoint returns a single entity under `result.item`, always — tasks
 * included, where the v2 method answered `result.task`.
 *
 * Worth a rule of its own because TypeScript cannot catch it: the response type
 * is supplied by the caller as a generic argument, so `<{ task: … }>` compiles
 * happily against a body that has no `task` key. The read then yields
 * `undefined`, and `Number(undefined)` is `NaN` — so the caller reports a
 * created entity with an id of `NaN` rather than failing. Two recipes shipped
 * that way (#476).
 *
 * Only fires where the version context says v3, so the v2 spelling — which is
 * correct there — stays silent. Prose is skipped too: explaining the mistake
 * is not making it, and the sentence naming `result.task` as the v2 spelling
 * is exactly the documentation this rule wants to keep.
 */
const V2_RESULT_KEY = /\bresult\.task\b|<\{\s*task\s*:/g

/**
 * Is this line prose rather than code?
 *
 * A comment either way — `//`, or a `*` continuing a JSDoc block — plus, in
 * markdown, anything outside a fenced block.
 *
 * Indented (four-space) code blocks are read as prose by this test. That is a
 * known gap rather than an oversight: every code sample in this repository is
 * fenced, because the typecheck gates find blocks by fence and an indented one
 * would already be invisible to them.
 */
function isComment(line) {
  return line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')
}

function isProse(file, lines, index) {
  const line = (lines[index] ?? '').trim()
  if (file.endsWith('.md') && enclosingFenceStart(lines, index) === -1) {
    return true
  }
  return isComment(line)
}

/**
 * Which surface does a result read belong to?
 *
 * `versionContextAt` looks ±8 lines, which is right for a `method:` literal
 * sitting inside its call but too narrow here: a read comes *after* the call,
 * and a call with a long `fields` object puts `actions.v3.` well out of that
 * window — recipe 03 spans some twenty lines between the two. So walk back to
 * the nearest preceding `actions.vN.` instead, with no distance limit: a result
 * read belongs to the last call opened above it. Falls back to the shared
 * context when nothing is found, and `null` stays a real answer.
 *
 * In markdown the walk stops at the enclosing fence. A page routinely shows a
 * v3 sample and then a v2 one, and the v2 sample may name no action of its own
 * — only the response shape. Without the bound, its correct `result.task`
 * would be attributed to the v3 call further up the page and reported as an
 * error. A fenced sample is its own scope; `versionContextAt` then decides,
 * which is what reads the `[v2]` / `[v3]` fence tag.
 */
function callSurfaceAbove(file, lines, index) {
  const floor = file.endsWith('.md') ? Math.max(0, enclosingFenceStart(lines, index)) : 0
  for (let i = index; i >= floor; i--) {
    const found = /actions\.v([23])\./.exec(lines[i] ?? '')
    if (found !== null) {
      return `v${found[1]}`
    }
  }
  return versionContextAt(file, lines, index)
}

function checkResultKey(file, body) {
  const lines = body.split(/\r\n?|\n/)
  for (const m of body.matchAll(V2_RESULT_KEY)) {
    const line = body.slice(0, m.index).split(/\r\n?|\n/).length
    if (callSurfaceAbove(file, lines, line - 1) !== 'v3') {
      continue
    }
    if (isProse(file, lines, line - 1)) {
      continue
    }
    if (isMarkedIgnored(lines, line - 1, 'result.task')) {
      continue
    }
    report.error(
      file,
      `reads "${m[0]}" on a restApi:v3 call — v3 returns a single entity under \`result.item\`, `
      + `including tasks (the v2 method answered \`result.task\`). TypeScript cannot catch this: `
      + `the response type is the caller's own generic argument, so the read silently yields `
      + `undefined. Use \`result.item\`, or mark the line `
      + `"@check-ignore: <reason naming result.task>" if it is a deliberate anti-example`,
      { line }
    )
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
    if (isMarkedIgnored(lines, hit.line - 1, hit.name)) {
      // Not counted as documented either: a marked placeholder is not a method
      // this repository describes, and counting it inflated the very number
      // `--coverage` exists to report.
      continue
    }
    documented.add(hit.name)
    if (snapshots.length === 0) {
      continue
    }
    const publishedBy = snapshots.filter(s => s.methods.has(hit.name))
    if (publishedBy.length === 0) {
      report.error(
        file,
        `"${hit.name}" is used as a v3 method (${hit.position}) but no committed portal snapshot `
        + `publishes it — fix the name; or, if the method is real and new, refresh a snapshot `
        + `(\`--refresh\`, see .github/contributing/documentation.md); or mark the line `
        + `"@check-ignore: <reason naming ${hit.name}>" if it is a deliberate anti-example`,
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
  // Wrapped, and the caught error deliberately discarded: Node's `fetch failed`
  // carries a `cause` of `getaddrinfo ENOTFOUND <hostname>`, so an uncaught
  // network error prints the portal's host. The secret is in the path rather
  // than the host, but neither belongs in a terminal someone may paste from.
  let response
  try {
    response = await fetch(`${base}rest.documentation.openapi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      // The webhook URL *is* the credential, and it is carried in the path. A
      // 30x — a misconfigured vanity domain, a captive portal, hijacked DNS —
      // would hand that path to whatever host `Location` names, silently. This
      // is the only way the secret can leave the origin it was meant for.
      redirect: 'error'
    })
  } catch {
    console.error('could not reach the portal (network error)')
    process.exit(1)
  }
  if (!response.ok) {
    // Deliberately without the body or the URL: both can carry the secret.
    console.error(`portal refused with HTTP ${response.status}`)
    process.exit(1)
  }

  let document
  try {
    document = await response.json()
  } catch {
    console.error('the portal did not answer with JSON')
    process.exit(1)
  }
  // `typeof null === 'object'`, so a body carrying `"paths": null` passed this
  // and wrote a snapshot of zero methods — which `loadSnapshots` then accepts,
  // because an empty array is a valid array. As the newest file of its kind it
  // would report the whole surface as lost.
  if (document?.paths === null || typeof document?.paths !== 'object' || Array.isArray(document.paths)) {
    console.error('the response carried no usable `paths` object — not an OpenAPI document')
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
  if (reduced.methods.length === 0) {
    // Writing this would be worse than failing: as the newest file of its kind
    // it makes every method the portal publishes look withdrawn.
    console.error('the portal answered with no methods at all — refusing to write an empty snapshot')
    process.exit(1)
  }
  mkdirSync(SNAPSHOT_DIR, { recursive: true })
  const file = join(SNAPSHOT_DIR, `openapi-${kind}-${reduced.snapshotDate}.json`)
  writeFileSync(file, `${JSON.stringify(reduced, null, 2)}\n`)
  return { file: basename(file), totals: reduced.totals }
}

/**
 * What the committed snapshots say about their own staleness (#472).
 *
 * The issue asked how current a snapshot has to be and recorded the honest
 * answer — nobody knew, because no series existed. One exists now, so the rate
 * is measured here rather than written down as a number that would itself go
 * stale.
 *
 * Everything is **per portal kind**, including the age. Three earlier drafts
 * were wrong in ways worth keeping written down, because each looked right:
 *
 *  - An age taken across all kinds, multiplied by a rate measured within one.
 *    Committing a single fresh on-premise snapshot then reported the cloud
 *    snapshots as current while they were a hundred days stale.
 *  - A rate measured between the **furthest apart** pair. The guide tells
 *    contributors to keep old snapshots, so that number degrades every time
 *    someone follows it: adding a two-year-old file took the measured rate from
 *    2.7 names a day to 0.055. The rate now comes from the two most recent
 *    snapshots of the kind, which is the only pair that describes now.
 *  - "Recent enough" printed whenever the projection rounded to zero, which is
 *    a statement about the rate and not about the age. A 335-day-old snapshot
 *    that had gained nothing was announced as recent.
 *
 * Deliberately never an error, on either the default run or `--coverage`: a
 * contributor without a portal cannot refresh, and a check that is red by
 * design gets switched off.
 */
export function measureDrift(snapshots, today = new Date()) {
  const DAY_MS = 86_400_000
  const PROJECTION_LIMIT = 4
  const dated = []
  let unusable = 0

  for (const snapshot of snapshots) {
    const date = Date.parse(`${snapshot.raw?.snapshotDate}T00:00:00Z`)
    const kind = snapshot.raw?.portalKind
    // A file missing either field is skipped rather than defaulted. Grouping an
    // unnamed kind under `undefined` would pair an on-premise snapshot with a
    // cloud one, which is the single thing this function must not do.
    if (!Number.isFinite(date) || typeof kind !== 'string' || kind === '') {
      unusable++
      continue
    }
    dated.push({ ...snapshot, date, kind })
  }

  const byKind = {}
  for (const snapshot of dated) {
    (byKind[snapshot.kind] ??= []).push(snapshot)
  }

  const kinds = Object.entries(byKind).map(([kind, group]) => {
    const ordered = [...group].sort((a, b) => a.date - b.date)
    const newest = ordered[ordered.length - 1]
    const ageDays = Math.floor((today.getTime() - newest.date) / DAY_MS)

    const measured = { kind, ageDays, future: ageDays < 0, rate: null, behind: null, projectable: false }

    // The two most recent, not the two furthest apart. Same-day pairs give no
    // slope rather than a division by zero.
    const previous = ordered[ordered.length - 2]
    const spanDays = previous ? Math.round((newest.date - previous.date) / DAY_MS) : 0

    if (previous && spanDays > 0) {
      const added = [...newest.methods].filter(m => !previous.methods.has(m)).length
      const removed = [...previous.methods].filter(m => !newest.methods.has(m)).length
      measured.rate = { spanDays, added, removed, perDay: added / spanDays }
      // Projected only a little way past the window it was measured over.
      // Linear extrapolation of 13 days to a year produced "missing roughly 983
      // name(s)" against a surface of 278 — not an order of magnitude, just
      // visibly broken arithmetic, and on the line a docs PR quotes. Four times
      // the window is already generous for a rate built from two points.
      measured.projectable = ageDays >= 0 && ageDays <= spanDays * PROJECTION_LIMIT
      measured.behind = measured.projectable ? Math.round((added / spanDays) * ageDays) : null
    }

    return measured
  }).sort((a, b) => a.kind.localeCompare(b.kind))

  return { kinds, unusable }
}

/**
 * One block per portal kind. `documented` is only used for the share, which is
 * what keeps the projection from being read as a count of failures: a name the
 * newest snapshot is missing costs nothing unless somebody documents it, and
 * this repository names about one published method in twenty.
 */
function printDrift(snapshots, documented, today = new Date()) {
  const { kinds, unusable } = measureDrift(snapshots, today)

  if (unusable > 0) {
    console.log(`${unusable} snapshot(s) skipped — no usable snapshotDate or portalKind; re-run --refresh`)
  }
  if (kinds.length === 0) {
    return
  }

  for (const { kind, ageDays, future, rate, behind } of kinds) {
    if (future) {
      console.log(`${kind}: newest snapshot is dated ${-ageDays} day(s) in the FUTURE — check the clock that wrote it`)
      continue
    }

    console.log(`${kind}: newest snapshot is ${ageDays} day(s) old`)

    if (!rate) {
      // One snapshot of a kind is a point, and a point has no slope. Said out
      // loud so the absence is legible rather than looking like zero drift.
      console.log(`  drift: not measurable — needs two ${kind} snapshots taken on different days`)
      continue
    }

    console.log(
      `  measured over the last ${rate.spanDays} day(s) between snapshots: `
      + `+${rate.added} method name(s), -${rate.removed}`
    )

    if (rate.added === 0) {
      console.log('  nothing was added across that pair, so there is no rate to project')
    } else if (behind === null) {
      console.log(
        `  no projection: ${ageDays} day(s) is too far past the ${rate.spanDays}-day window the rate `
        + 'was measured over for the extrapolation to mean anything — refresh instead'
      )
    } else if (behind > 0) {
      // Deliberately not "N failures". A missing name is a failure only if
      // somebody documents it, and the share below is the honest scale.
      const share = documented.size > 0 && rate ? ` — this repository names ${documented.size} v3 method(s) in total` : ''
      console.log(`  at that rate it is missing roughly ${behind} name(s) published since${share}`)
      console.log('  any one of those would fail the gate if a page named it, until a refresh')
    }
  }

  // Two points are a line, not a trend, and nothing here knows whether the
  // snapshots of one kind came from the same portal — two cloud portals
  // measured a day apart already disagreed on 28 names.
  console.log('(two points per kind, possibly two portals — an order of magnitude, not a forecast)')
  console.log('')
}

function printCoverage(snapshots, documented) {
  if (snapshots.length === 0) {
    console.log('coverage: no snapshot committed under scripts/data/ — run with --refresh against a portal.')
    return
  }
  console.log('v3 method coverage — portal snapshots against what this repository documents\n')
  printDrift(snapshots, documented)

  // The per-module table is the useful part and the long part: 23 lines each.
  // "Keep both, prune deliberately" grows this monotonically — ten snapshots was
  // 188 lines, past the point where anyone pastes it into a PR. So the newest of
  // each kind gets the table and the rest get a line.
  const newestOfKind = new Set()
  for (const kind of new Set(snapshots.map(s => s.raw.portalKind))) {
    const ofKind = snapshots.filter(s => s.raw.portalKind === kind)
    newestOfKind.add(ofKind.reduce((a, b) => (a.raw.snapshotDate >= b.raw.snapshotDate ? a : b)).name)
  }

  for (const snapshot of snapshots) {
    const published = snapshot.raw.methods
    const covered = published.filter(m => documented.has(m.method))

    // What only THIS snapshot publishes and this repository documents. It is
    // the number the guide's pruning rule asks for: at zero, dropping the file
    // narrows the union without red-lighting a page that is correct today.
    const uniqueAndDocumented = [...snapshot.methods]
      .filter(name => documented.has(name) && !snapshots.some(other => other !== snapshot && other.methods.has(name)))

    console.log(`${snapshot.name}  (${snapshot.raw.portalKind}, ${snapshot.raw.snapshotDate})`)
    console.log(
      `  publishes ${published.length}, documented here ${covered.length}, never named ${published.length - covered.length}`
      + `, unique to it and documented ${uniqueAndDocumented.length}`
      + (uniqueAndDocumented.length > 0
        ? ` (${uniqueAndDocumented.sort().join(', ')})`
        // Only an older snapshot is a pruning candidate. Saying this of the
        // newest of a kind would invite deleting the only current baseline.
        : newestOfKind.has(snapshot.name) ? '' : ' — safe to prune')
    )

    if (!newestOfKind.has(snapshot.name)) {
      console.log('')
      continue
    }

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

// Only when run, never when imported: the tests import `reduceDocument` to
// exercise the part `--refresh` owns, and a module body that calls
// `process.exit` on import ends the test run instead.
const isEntryPoint = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href

if (!isEntryPoint) {
  // nothing to do — the exports above are the whole point of an import
} else if (wantRefresh) {
  await refresh()
} else {
  const snapshots = loadSnapshots()
  const documented = new Set()

  for (const file of filesToCheck()) {
    const body = readFileSync(file, 'utf8')
    checkPhantomActions(file, body)
    checkResultKey(file, body)
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
