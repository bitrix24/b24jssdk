#!/usr/bin/env node

/**
 * Internal-link check for AGENTS.md and .github/contributing/*.md (#54).
 *
 * Verifies that every Markdown link pointing at a repo path resolves to a real
 * file or directory — catching the "a file was renamed/moved and the guide
 * silently rots" class that manual review caught twice during the PR #35 reviews
 * (neither `tsc` nor the snippet-compile pass sees prose link targets).
 *
 * Scope: repo-relative links only. Skips external URLs (`https:`, `mailto:`, …),
 * site-absolute links (`/docs/…`), and pure `#anchors`. A trailing `#fragment`
 * or `?query` is stripped before the existence check (anchor validity is out of
 * scope). Fenced and inline code is stripped first so illustrative snippets
 * don't produce false positives.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// MD_INTERNAL_LINKS_ROOT overrides the scan root (used by the fixture tests).
const ROOT = process.env.MD_INTERNAL_LINKS_ROOT
  ? resolve(process.env.MD_INTERNAL_LINKS_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..')

function targetFiles() {
  const files = []
  const agents = join(ROOT, 'AGENTS.md')
  if (existsSync(agents)) {
    files.push(agents)
  }
  const contribDir = join(ROOT, '.github', 'contributing')
  if (existsSync(contribDir)) {
    for (const name of readdirSync(contribDir).sort()) {
      if (name.endsWith('.md')) {
        files.push(join(contribDir, name))
      }
    }
  }
  return files
}

// Strip fenced code (a run of ≥3 backticks closed by the same length, so a
// ```` ```` ```` block can wrap nested ``` fences) and inline code, so
// illustrative snippets don't produce false positives.
function stripCode(md) {
  return md.replace(/(`{3,})[\s\S]*?\1/g, '').replace(/`[^`\n]*`/g, '')
}

// [text](target) and ![alt](target); capture up to ) or whitespace (drops a "title")
const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)/g

function isRepoRelative(target) {
  if (target.startsWith('#')) {
    return false // same-page anchor
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) {
    return false // has a scheme: https:, mailto:, tel:, …
  }
  if (target.startsWith('/')) {
    return false // site-absolute route, not a repo path
  }
  return true
}

let broken = 0
let checked = 0

for (const file of targetFiles()) {
  const body = stripCode(readFileSync(file, 'utf8'))
  const dir = dirname(file)
  let match
  while ((match = LINK_RE.exec(body)) !== null) {
    const target = match[1].trim()
    if (!isRepoRelative(target)) {
      continue
    }
    const path = target.replace(/[#?].*$/, '')
    if (path === '') {
      continue
    }
    checked += 1
    if (!existsSync(resolve(dir, path))) {
      broken += 1
      console.log(`\x1B[31mBROKEN\x1B[0m ${relative(ROOT, file)} → ${target}`)
    }
  }
}

console.log(`\nmd-internal-links: ${broken} broken link(s), ${checked} internal link(s) checked`)
process.exit(broken > 0 ? 1 : 0)
