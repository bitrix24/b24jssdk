// Shared helpers for scripts/docs-lint.mjs and scripts/docs-link-check.mjs.
//
// Kept tiny and dependency-free on purpose: both scripts run in CI and we
// don't want to introduce a runtime dep just for a markdown walker.

import { readdirSync, lstatSync } from 'node:fs'
import { join } from 'node:path'

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

/**
 * Minimal YAML parser sufficient for our frontmatter shape: scalar
 * `key: value`, dotted keys (`navigation.title`), arrays opened by `key:`
 * followed by `  - item` lines, and continuation lines indented under an
 * array item. Does NOT cover flow-style YAML, anchors, multi-doc separators,
 * or block scalars (`|` / `>`). If frontmatter ever needs any of that, swap
 * in `js-yaml`.
 *
 * Defensive against three real-world edge cases:
 * - UTF-8 BOM at the start of the file (Windows editors).
 * - `\r\n` line endings (Windows checkouts).
 * - Frontmatter keys that would otherwise reach `Object.prototype`
 *   (`__proto__`, `constructor`, `prototype`) — silently dropped.
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
  const frontmatter = Object.create(null)
  let currentKey = null
  let currentArray = null
  for (const rawLine of fm.split('\n')) {
    const line = rawLine.replace(/\s+$/, '')
    if (!line.trim()) continue
    if (/^\s+- /.test(line) && currentArray) {
      currentArray.push(line.replace(/^\s+- /, '').trim())
      continue
    }
    if (/^\s{2,}/.test(line) && currentKey && currentArray) {
      const last = currentArray[currentArray.length - 1]
      currentArray[currentArray.length - 1] = last + '\n' + line.trim()
      continue
    }
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx)
    if (!/^[\w.-]+$/.test(key)) continue
    // Guard against prototype-pollution-shaped keys. The frontmatter object
    // is also created with `Object.create(null)` above for defence-in-depth.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    const val = line.slice(colonIdx + 1).trim()
    if (val === '') {
      frontmatter[key] = []
      currentKey = key
      currentArray = frontmatter[key]
      continue
    }
    frontmatter[key] = val.replace(/^['"]|['"]$/g, '')
    currentKey = key
    currentArray = null
  }
  return { frontmatter, body }
}
