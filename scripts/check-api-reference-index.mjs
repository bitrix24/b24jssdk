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
 * asserts every name appears on the page. Deliberately source-based, not
 * `dist/`-based: `dist/` is gitignored, absent in a fresh clone, and a stale
 * local build silently validates the page against yesterday's surface.
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(ROOT, 'packages/jssdk/src/index.ts')
const PAGE = join(ROOT, 'docs/content/docs/3.api-reference/1.index.md')

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
 * Collect the value exports a single file contributes, recursing through
 * `export * from` barrels. `seen` guards against a cyclic barrel graph.
 */
export function collectValueExports(entry, seen = new Set(), read = readFileSync) {
  if (seen.has(entry)) {
    return new Set()
  }
  seen.add(entry)

  const names = new Set()
  const source = String(read(entry, 'utf8'))

  // `export * from './x'` — recurse into the barrel.
  for (const match of source.matchAll(/^\s*export\s+\*\s+from\s+['"]([^'"]+)['"]/gm)) {
    const target = resolveSpecifier(entry, match[1])
    if (!target) {
      throw new Error(`${entry}: cannot resolve \`export * from '${match[1]}'\``)
    }
    for (const name of collectValueExports(target, seen, read)) {
      names.add(name)
    }
  }

  // `export { A, B as C }` — with or without `from`. `export type { … }` is a
  // pure type re-export and is skipped wholesale.
  for (const match of source.matchAll(/^\s*export\s+(type\s+)?\{([^}]*)\}/gm)) {
    if (match[1]) {
      continue
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
      const exported = spec.includes(' as ') ? spec.split(/\s+as\s+/)[1] : spec
      if (exported && exported !== 'default') {
        names.add(exported.trim())
      }
    }
  }

  // Direct value declarations. `interface` and `type` are excluded by omission.
  const DECLARATIONS
    = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:default\s+)?(?:async\s+)?(?:class|const|let|var|function|enum)\s+([A-Za-z_$][\w$]*)/gm
  for (const match of source.matchAll(DECLARATIONS)) {
    names.add(match[1])
  }

  return names
}

/** Every backtick-quoted identifier on the page — its claimed vocabulary. */
export function collectPageNames(markdown) {
  const names = new Set()
  for (const match of markdown.matchAll(/`([A-Z_$][\w$]*)`/gi)) {
    names.add(match[1])
  }
  // Table rows link the name rather than backtick it in some places; catch the
  // linked form too: `[`Name`](url)` is already covered, but a bare `[Name](url)`
  // is not.
  for (const match of markdown.matchAll(/\[`?([A-Za-z_$][\w$]*)`?\]\(https:\/\/github\.com/g)) {
    names.add(match[1])
  }
  return names
}

function main() {
  const exported = collectValueExports(ENTRY)
  const onPage = collectPageNames(readFileSync(PAGE, 'utf8'))

  const missing = [...exported].filter(name => !onPage.has(name)).sort()

  if (missing.length > 0) {
    console.error(
      `docs/content/docs/3.api-reference/1.index.md is missing ${missing.length} public export(s):\n`
      + missing.map(name => `  - ${name}`).join('\n')
      + '\n\nThe page claims to index every value export. Add each name to the '
      + 'right domain table (with a source link and a guide link, or `—`), or to '
      + 'the "Everything else" list if it is reachable from a group above.'
    )
    process.exit(1)
  }

  console.log(`api-reference index: ${exported.size} public value export(s) — all present.`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}
