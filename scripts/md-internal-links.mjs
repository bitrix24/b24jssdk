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
  // Root-level docs that link into the tree. SECURITY.md joined the list when
  // it was written: it points at `redact.ts` and the three lint rules as the
  // defences a reporter should probe, so a link that rots there sends someone
  // hunting for a file that moved — in the one document read under time
  // pressure.
  for (const name of ['AGENTS.md', 'SECURITY.md']) {
    const path = join(ROOT, name)
    if (existsSync(path)) {
      files.push(path)
    }
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

/**
 * GitHub's heading-anchor slug: lowercased, punctuation dropped, spaces to
 * hyphens. Close enough for the headings this repo writes — it does not model
 * GitHub's duplicate-heading `-1` suffixes, so a file with two identically named
 * headings would resolve both to the same anchor. No such file exists here, and
 * the failure mode is a false pass rather than a false alarm.
 */
function headingAnchors(markdown) {
  // Fenced blocks only — NOT `stripCode`, which also removes inline-code
  // *content*: it turns `## \`AjaxResult\` paging helpers` into `##  paging
  // helpers`, dropping the first word of the slug. GitHub keeps the text and
  // drops the ticks, which is what the replace below does.
  const withoutFences = markdown.replace(/(`{3,})[\s\S]*?\1/g, '')
  const anchors = new Set()
  // The hashes, then one separator, then the rest of the line. Trailing space is
  // trimmed in JS and the text is matched with a negated class rather than `.+`:
  // a `[ \t]+` beside `.+` can exchange characters with it, which is a genuine
  // polynomial-backtracking case, not a false alarm from the linter.
  for (const match of withoutFences.matchAll(/^#{1,6}[ \t]([^\n]*)$/gm)) {
    anchors.add(
      match[1]
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link text, not the URL
        .replace(/[`*_~]/g, '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
    )
  }
  return anchors
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
    const resolved = resolve(dir, path)
    if (!existsSync(resolved)) {
      broken += 1
      console.log(`\x1B[31mBROKEN\x1B[0m ${relative(ROOT, file)} → ${target}`)
      continue
    }
    // A link to a heading that no longer exists lands the reader at the top of
    // the right file with no hint that they are in the wrong place — quieter
    // than a 404 and just as wrong. Only `.md` targets have headings to check.
    const fragment = target.includes('#') ? target.slice(target.indexOf('#') + 1) : ''
    if (fragment === '' || !path.endsWith('.md')) {
      continue
    }
    if (!headingAnchors(readFileSync(resolved, 'utf8')).has(fragment)) {
      broken += 1
      console.log(`\x1B[31mBROKEN\x1B[0m ${relative(ROOT, file)} → ${target} (no such heading in ${path})`)
    }
  }
}

console.log(`\nmd-internal-links: ${broken} broken link(s), ${checked} internal link(s) checked`)
process.exit(broken > 0 ? 1 : 0)
