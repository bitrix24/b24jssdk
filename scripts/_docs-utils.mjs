// Shared helpers for scripts/docs-lint.mjs and scripts/docs-link-check.mjs.
//
// Kept tiny on purpose: both scripts run in CI. The only third-party dep is
// `js-yaml` (a root devDependency) for frontmatter parsing — see
// `parseFrontmatter`.

import { readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

/**
 * Recursively collect every `.md` file under `dir`.
 *
 * Uses `lstatSync` (not `statSync`) so a directory-symlink can't drive the
 * recursion into a cycle; symlinks are skipped.
 *
 * @param {string} dir Absolute path to walk.
 * @returns {string[]} Absolute `.md` paths in deterministic depth-first order.
 */
export function walkMarkdownFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) out.push(...walkMarkdownFiles(full))
    else if (stat.isFile() && full.endsWith('.md')) out.push(full)
  }
  return out
}

/**
 * Strip a UTF-8 BOM at the start of a text buffer, if present.
 *
 * `readFileSync(file, 'utf8')` returns a string that still includes the
 * `U+FEFF` codepoint when the file was saved with a BOM (common on Windows).
 * Without this strip, `startsWith('---')` would be `false` and the
 * frontmatter would silently disappear.
 */
function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

// Keys that must never reach `Object.prototype`.
const POLLUTION_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Convert a value parsed by js-yaml into the shape the docs-lint callers
 * expect. The hand-rolled parser this replaced represented each `links:` array
 * item as a raw multi-line STRING (`"label: Foo\niconName: …\nto: …"`), and
 * both `extractGithubLinkPaths` (docs-lint.mjs) and
 * `extractInternalLinksFromLinksArray` (docs-link-check.mjs) split on `\n` and
 * look for a `to:` line. js-yaml instead yields an array of plain OBJECTS
 * (`{ label, iconName, to }`). To keep observable behaviour identical without
 * touching those consumers, we re-serialise each object array item back into
 * the `key: value` line form. Scalar array items pass through unchanged.
 */
function toLegacyArrayItems(arr) {
  return arr.map((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.entries(item)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    }
    return item
  })
}

/**
 * Thin wrapper around `js-yaml` for our Markdown frontmatter.
 *
 * The heavy lifting (scalar `key: value`, dotted keys like `navigation.title`,
 * `links:` arrays with per-item fields) is delegated to `yaml.load`. This file
 * only owns the boundary concerns the loader doesn't:
 *
 * - UTF-8 BOM at the start of the file (Windows editors) is stripped.
 * - `\r\n` line endings (Windows checkouts) are collapsed to `\n`.
 * - Prototype-pollution-shaped top-level keys (`__proto__`, `constructor`,
 *   `prototype`) are dropped, and the returned object is built with
 *   `Object.create(null)` for defence-in-depth.
 * - `links:` array items are re-serialised to the legacy multi-line-string
 *   shape the consumers in docs-lint.mjs / docs-link-check.mjs expect (see
 *   `toLegacyArrayItems`).
 *
 * @param {string} text Raw file contents.
 * @returns {{ frontmatter: Record<string, unknown>, body: string }}
 */
export function parseFrontmatter(text) {
  // Normalise: strip BOM and collapse CRLF before any structural matching.
  const normalized = stripBom(text).replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---')) return { frontmatter: {}, body: normalized }
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: {}, body: normalized }
  const fm = normalized.slice(3, end).trim()
  const body = normalized.slice(end + 4).replace(/^\n/, '')

  let parsed
  try {
    // JSON_SCHEMA (not the default schema) so the legacy string-parser's
    // observable output doesn't change: `audited: 2026-05-26` stays a string
    // (the default schema's YAML timestamp type coerces it to a JS Date,
    // breaking the `frontmatter.audited + 'T…'` concat in docs-lint.mjs).
    parsed = yaml.load(fm, { schema: yaml.JSON_SCHEMA })
  } catch {
    return { frontmatter: {}, body }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { frontmatter: {}, body }
  }

  const frontmatter = Object.create(null)
  for (const [key, value] of Object.entries(parsed)) {
    // Guard against prototype-pollution-shaped keys. The frontmatter object is
    // also created with `Object.create(null)` for defence-in-depth.
    if (POLLUTION_KEYS.has(key)) continue
    frontmatter[key] = Array.isArray(value) ? toLegacyArrayItems(value) : value
  }
  return { frontmatter, body }
}

/**
 * Whether a `links:` source target participates in the audit-freshness check.
 *
 * Audit-freshness (`docs-lint.mjs`) flags a page when a source it documents has
 * changed since the page's `audited:` date — the page should then be
 * re-verified. That signal is meaningful for *source code* (`.ts`), but not for
 * the Markdown sources some pages also link (skills, `AGENTS.md`,
 * `CHANGELOG.md`): those are parallel documentation, not the API source of
 * truth. A one-line edit to a widely-cited skill (or any changelog bump) would
 * otherwise staleify every page that links it — a 1→N cascade of mechanical
 * `audited:` bumps. So Markdown link targets (`.md` / `.mdx`) are excluded;
 * every non-Markdown target (`.ts`, config, …) still drives the check.
 *
 * @param {string} localPath Repo-relative path of the link target (e.g.
 *   `packages/jssdk/src/core/result.ts` or `skills/b24jssdk-rest/SKILL.md`).
 * @returns {boolean} `true` if changes to this target should age a page's audit.
 */
export function isFreshnessTrackedSource(localPath) {
  return !/\.mdx?$/i.test(localPath)
}
