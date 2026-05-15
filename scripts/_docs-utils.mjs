// Shared helpers for scripts/docs-lint.mjs and scripts/docs-link-check.mjs.
//
// Kept tiny and dependency-free on purpose: both scripts run in CI and we
// don't want to introduce a runtime dep just for a markdown walker.

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export function walkMarkdownFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walkMarkdownFiles(full))
    else if (full.endsWith('.md')) out.push(full)
  }
  return out
}

// Minimal YAML parser. Sufficient for our frontmatter shape: scalar `key: value`,
// dotted keys (`navigation.title`), arrays opened by `key:` followed by `  - item`
// lines, and continuation lines indented under an array item. Does NOT cover
// flow-style YAML, anchors, multi-doc separators, or block scalars (`|` / `>`).
// If frontmatter ever needs any of that, swap in `js-yaml` — until then the
// hand-rolled parser keeps us zero-dep.
export function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { frontmatter: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: {}, body: text }
  const fm = text.slice(3, end).trim()
  const body = text.slice(end + 4).replace(/^\n/, '')
  const frontmatter = {}
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
