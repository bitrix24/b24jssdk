#!/usr/bin/env node
/**
 * Pins `docs/content/docs/3.api-reference/1.index.md` against the code.
 *
 * That page's whole value proposition is *completeness*: it claims to list every
 * value the package exports. Nothing else in the repo notices when that stops
 * being true — `docs-lint.mjs` only checks a page's `audited:` stamp against the
 * files named in its `links:` frontmatter, and this page names one barrel
 * (`index.ts`) that almost never changes. So adding, renaming or removing an
 * export anywhere under the 50-odd re-exported modules would leave the index
 * quietly wrong, and every gate green (#315 review).
 *
 * This script closes that gap. It resolves the public value surface statically
 * from `packages/jssdk/src/index.ts` — following `export * from` chains — and
 * compares it against the page in **both** directions: an export the page omits
 * is a gap, and a name the page lists that is no longer exported is a stale row
 * left behind by a rename or a removal. A one-directional check would have
 * caught only the first, leaving a renamed export listed twice.
 *
 * Deliberately source-based, not `dist/`-based: `dist/` is gitignored, absent in
 * a fresh clone, and a stale local build silently validates the page against
 * yesterday's surface.
 *
 * Only *value* exports are checked. Pure `type` / `interface` exports are out of
 * scope by the page's own stated scope — they live in the Types overview.
 *
 * Usage: node scripts/check-api-reference-index.mjs
 * Exits 1 and names the offending exports when the page and the code disagree.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReporter } from './_reporter.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Overridable so the fixture tests can drive the real entry point end to end,
// including its exit codes and messages, against a synthetic tree.
const ENTRY = process.env.API_REFERENCE_INDEX_ENTRY ?? join(ROOT, 'packages/jssdk/src/index.ts')
const PAGE = process.env.API_REFERENCE_INDEX_PAGE ?? join(ROOT, 'docs/content/docs/3.api-reference/1.index.md')

/**
 * Resolve a relative specifier to a real `.ts` file, handling the two forms the
 * SDK uses: `./x` → `x.ts`, and `./x` → `x/index.ts` (a directory barrel).
 */
function resolveSpecifier(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Blank out comments and template-literal bodies before matching.
 *
 * Every pattern below is line-anchored text matching, so an example line inside
 * a JSDoc block — `export const foo = …` at column zero, which is exactly how
 * this codebase writes doc examples — would otherwise be collected as a real
 * export and the page failed for not listing it. Same for a snippet inside a
 * template literal.
 *
 * Newlines are preserved so line numbers and line-start anchors still line up;
 * only the content is replaced with spaces.
 */
function stripCommentsAndStrings(source) {
  const blank = text => text.replaceAll(/[^\n]/g, ' ')
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, blank)
    .replaceAll(/\/\/[^\n]*/g, blank)
    .replaceAll(/`(?:[^`\\]|\\[\s\S])*`/g, blank)
}

/**
 * Collect the value exports a single file contributes, recursing through
 * `export * from` barrels. `seen` guards against a cyclic barrel graph.
 */
export function collectValueExports(entry, seen = new Set()) {
  if (seen.has(entry)) {
    return new Set()
  }
  seen.add(entry)

  const names = new Set()
  const source = stripCommentsAndStrings(readFileSync(entry, 'utf8'))

  // `export * as ns from './x'` binds one namespace object rather than
  // re-exporting names, so the walk below would silently skip it and
  // under-collect. The SDK does not use the form today; if it ever does, this
  // says so loudly instead of quietly weakening the gate.
  const namespaceReexport = /^\s*export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/m.exec(source)
  if (namespaceReexport) {
    throw new Error(
      `${entry}: \`export * as ${namespaceReexport[1]} from …\` is not supported by this checker. `
      + 'Teach collectValueExports to record the namespace binding before using the form.'
    )
  }

  // `export * from './x'` — recurse into the barrel.
  for (const match of source.matchAll(/^\s*export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
    const target = resolveSpecifier(entry, match[1])
    if (!target) {
      throw new Error(`${entry}: cannot resolve \`export * from '${match[1]}'\``)
    }
    for (const name of collectValueExports(target, seen)) {
      names.add(name)
    }
  }

  // `export { A, B as C }` — with or without `from`. `export type { … }` is a
  // pure type re-export and is skipped wholesale.
  const REEXPORTS = /^\s*export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s+['"]([^'"]+)['"])?/gm
  for (const match of source.matchAll(REEXPORTS)) {
    if (match[1]) {
      continue
    }

    // With a `from`, the `type` keyword at THIS site says nothing about what the
    // target actually declares: `export { Foo } from './impl'` re-exports a
    // type-only `Foo` without any marker. Resolving the target and keeping only
    // the names it exports as values is what stops the gate demanding a page row
    // for something no consumer can import at runtime.
    let targetValues = null
    if (match[3]) {
      const target = resolveSpecifier(entry, match[3])
      if (!target) {
        throw new Error(`${entry}: cannot resolve \`export { … } from '${match[3]}'\``)
      }
      // A fresh `seen` — the target's own exports are needed here even if the
      // barrel walk already visited it for its side of the surface.
      targetValues = collectValueExports(target, new Set())
    }

    for (const rawEntry of match[2].split(',')) {
      const spec = rawEntry.trim()
      if (spec === '') {
        continue
      }
      // A per-specifier `type` prefix (`export { type Foo, Bar }`) is type-only.
      if (/^type\s/.test(spec)) {
        continue
      }
      const [local, aliased] = spec.split(/\s+as\s+/)
      const exported = (aliased ?? local).trim()
      if (exported === '' || exported === 'default') {
        continue
      }
      if (targetValues && !targetValues.has(local.trim())) {
        continue
      }
      names.add(exported)
    }
  }

  // Direct value declarations. `interface` and `type` are excluded by omission,
  // and so is `export default`: a default is not re-exported by `export *`, so
  // demanding a page entry for one would fail the gate over a name consumers
  // cannot import by that name at all.
  const DECLARATIONS
    = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|let|var|function|enum)\s+([A-Za-z_$][\w$]*)/gm
  for (const match of source.matchAll(DECLARATIONS)) {
    names.add(match[1])
  }

  assertNoMultiDeclarator(entry, source)

  return names
}

/**
 * `export const a = 1, b = 2` binds two names; DECLARATIONS above captures only
 * the first, so the second would go missing from the surface without anything
 * saying so. The SDK has no such statement today, and rather than grow a
 * bracket-aware declarator splitter for a form nobody uses, this refuses it —
 * matching how the walk treats `export * as ns`. Silent under-collection is the
 * one failure mode a completeness gate must not have.
 *
 * Detection scans a single line for a comma at bracket depth zero. A multi-line
 * initializer (an object or array literal) cannot produce one, since the line
 * ends before the depth returns to zero, so it raises no false alarm.
 *
 * Angle brackets count as nesting so a generic type annotation — the real
 * `export const StatusDescriptions: Record<Status, string> = {` in
 * `types/b24-helper.ts` — is not mistaken for a second declarator. The cost is
 * that a bare `>` (a comparison, an arrow) drives the depth negative and stops
 * detection for the rest of that line. That is the safe direction to err: this
 * guard failing to fire merely restores the old behaviour, while a false alarm
 * would redden CI over correct code.
 */
function assertNoMultiDeclarator(entry, source) {
  for (const line of source.split('\n')) {
    if (!/^\s*export\s+(?:declare\s+)?(?:const|let|var)\s/.test(line)) {
      continue
    }
    let depth = 0
    for (const char of line) {
      if ('([{<'.includes(char)) {
        depth += 1
      } else if (')]}>'.includes(char)) {
        depth -= 1
      } else if (char === ',' && depth === 0) {
        throw new Error(
          `${entry}: multi-declarator export is not supported by this checker:\n  ${line.trim()}\n`
          + 'Split it into one `export const` per name, or teach collectValueExports '
          + 'to read every declarator.'
        )
      }
    }
  }
}

/**
 * A domain-table row: `| [`Name`](source) | description | guide |`.
 *
 * @returns {{ name: string, hasGuide: boolean } | null}
 */
function tableRow(line) {
  const match = line.match(/^\|\s*\[`?([A-Z_$][\w$]*)`?\]\(/i)
  if (!match) {
    return null
  }

  // Split on the pipes and drop the empty strings the leading and trailing
  // delimiters produce — but keep an empty cell *between* two pipes. Filtering
  // every blank instead would make a row with an empty guide cell fall back to
  // its description, and any link in the description would then read as a
  // guide, marking the export as covered when the row says it is not.
  const cells = line.split('|').slice(1, -1)
  const guideCell = cells.at(-1) ?? ''

  return { name: match[1], hasGuide: guideCell.includes('](') }
}

/**
 * The names on a line that is nothing but backticked identifiers.
 *
 * Separators between them are tolerated — the page uses spaces today, and a
 * comma-separated rewrite should not silently empty the list. What is not
 * tolerated is prose: a line with any other word in it is not a name list, and
 * scraping backticks from prose would let `getData` or `isSuccess` satisfy the
 * gate for a future export that happens to share the name.
 *
 * @returns {string[]}
 */
function flatListNames(line) {
  const trimmed = line.trim()
  if (trimmed === '' || !/^`[A-Z_$][\w$]*`(?:[\s,;·•]*`[A-Z_$][\w$]*`)*$/i.test(trimmed)) {
    return []
  }
  return [...trimmed.matchAll(/`([A-Z_$][\w$]*)`/gi)].map(match => match[1])
}

/**
 * The names the page *claims* are exports — read from structured positions only,
 * never from prose.
 *
 * Two positions count: the leading linked cell of a domain-table row, and a
 * line consisting solely of backticked names (the "Everything else" and "Not yet
 * covered by a guide" lists). Scraping every backtick on the page instead would
 * be far laxer than it looks: the prose already contains `v2`, `isSuccess`,
 * `getData`, `postMessage` and friends, so a future export sharing one of those
 * names would satisfy the gate without ever being listed.
 *
 * Restricting to structured positions is also what makes the check
 * bidirectional — a name found here is a deliberate claim, so it can be held
 * against the real surface and fail when an export is renamed or removed.
 */
export function collectPageNames(markdown) {
  const names = new Set()

  for (const line of markdown.split('\n')) {
    const row = tableRow(line)
    if (row) {
      names.add(row.name)
    }
  }

  for (const line of markdown.split('\n')) {
    for (const name of flatListNames(line)) {
      names.add(name)
    }
  }

  return names
}

/**
 * The same names, but attributed to *where* on the page they sit (#384).
 *
 * `collectPageNames` deliberately returns their union, because the #383 gate
 * asks one question: does the page account for every export. This asks the
 * question that one cannot — do the page's three lists agree with each other.
 *
 * @returns {{
 *   rows: Map<string, boolean>,   name -> whether its guide cell is a link
 *   everythingElse: Set<string>,
 *   uncovered: Set<string>
 * }}
 */
export function collectPagePositions(markdown) {
  const rows = new Map()
  const everythingElse = new Set()
  const uncovered = new Set()

  // Which flat list a name-only line belongs to is decided by the heading above
  // it, so the page is walked in order rather than scanned as a whole.
  let section = ''

  for (const line of markdown.split('\n')) {
    if (line.startsWith('## ')) {
      section = line.slice(3).trim()
      continue
    }

    const row = tableRow(line)
    if (row) {
      rows.set(row.name, row.hasGuide)
      continue
    }

    const target = section.startsWith('Everything else')
      ? everythingElse
      : (section.startsWith('Not yet covered') ? uncovered : null)
    if (target === null) {
      continue
    }
    for (const name of flatListNames(line)) {
      target.add(name)
    }
  }

  return { rows, everythingElse, uncovered }
}

/**
 * Check the page's three lists against each other (#384).
 *
 * The #383 gate holds the page against the code, and is scoped to the union of
 * positions on purpose. That leaves two drifts possible with every gate green,
 * and the first is the one that matters: **"Not yet covered by a guide" is
 * designed to shrink, and shrinking is the operation nothing checks.** Someone
 * writing the guide for `LsKeys` has to remember to delete `LsKeys` from that
 * list by hand, and if they forget, the page goes on telling readers a page
 * does not exist after it does — which is worse than saying nothing, because
 * the reader stops looking.
 *
 * @returns {string[]} human-readable problems, empty when the lists agree
 */
export function checkListConsistency({ rows, everythingElse, uncovered }) {
  const problems = []

  const contradicted = [...uncovered].filter(name => rows.get(name) === true).sort()
  if (contradicted.length > 0) {
    problems.push(
      `${contradicted.length} name(s) listed as having no guide, whose table row links to one:\n`
      + contradicted.map(name => `  - ${name}`).join('\n')
      + '\n  The guide was written and the row updated; drop the name from '
      + '"Not yet covered by a guide".'
    )
  }

  const bothPlaces = [...everythingElse].filter(name => rows.has(name)).sort()
  if (bothPlaces.length > 0) {
    problems.push(
      `${bothPlaces.length} name(s) in both a domain table and "Everything else":\n`
      + bothPlaces.map(name => `  - ${name}`).join('\n')
      + '\n  "Everything else" is defined as the leftovers, so a name with a row '
      + 'of its own does not belong in it.'
    )
  }

  return problems
}

/**
 * Every export sits in exactly one of {a domain-table row, "Everything else"}.
 *
 * Note this is a different axis from "Not yet covered by a guide", and the
 * distinction is easy to lose: the first two lists are about *having a row on
 * this page*, the third about *having a guide elsewhere*. A name legitimately
 * appears in "Everything else" and in "Not yet covered" at once — no row, no
 * guide. A check forbidding that fires on nineteen names today, which is how
 * this comment came to be written.
 *
 * @returns {string[]} human-readable problems, empty when the split is clean
 */
export function checkPositionSplit(exported, { rows, everythingElse }) {
  const problems = []

  const unplaced = [...exported]
    .filter(name => !rows.has(name) && !everythingElse.has(name))
    .sort()
  if (unplaced.length > 0) {
    problems.push(
      `${unplaced.length} export(s) in neither a domain table nor "Everything else":\n`
      + unplaced.map(name => `  - ${name}`).join('\n')
      + '\n  Listing a name only under "Not yet covered by a guide" leaves it out '
      + 'of the index proper — that list records a missing guide, not a place on '
      + 'this page.'
    )
  }

  return problems
}

function main() {
  const exported = collectValueExports(ENTRY)
  const markdown = readFileSync(PAGE, 'utf8')
  const onPage = collectPageNames(markdown)

  const positions = collectPagePositions(markdown)

  const missing = [...exported].filter(name => !onPage.has(name)).sort()
  const stale = [...onPage].filter(name => !exported.has(name)).sort()

  const problems = []
  if (missing.length > 0) {
    problems.push(
      `${missing.length} public export(s) the page does not list:\n`
      + missing.map(name => `  - ${name}`).join('\n')
      + '\n  Add each to the right domain table (with a source link, and a guide '
      + 'link or `—`), or to the "Everything else" list if it is reachable from a '
      + 'group above.'
    )
  }
  if (stale.length > 0) {
    problems.push(
      `${stale.length} name(s) the page lists that are not public exports:\n`
      + stale.map(name => `  - ${name}`).join('\n')
      + '\n  The export was renamed or removed; drop the row, or point it at the '
      + 'current name.'
    )
  }

  const report = createReporter({ label: 'api-reference-index', root: ROOT })
  for (const problem of problems) {
    report.error(PAGE, `the page is out of sync with the code — ${problem}`)
  }
  for (const problem of checkListConsistency(positions)) {
    report.error(PAGE, `the page contradicts itself — ${problem}`)
  }
  for (const problem of checkPositionSplit(exported, positions)) {
    report.error(PAGE, `the page's own lists do not cover the surface — ${problem}`)
  }
  report.note(`${exported.size} public value export(s)`)

  const code = report.finish()
  if (code !== 0) {
    process.exit(code)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
