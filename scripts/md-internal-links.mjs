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
 * site-absolute links (`/docs/…`), and pure `#anchors`. A trailing `?query` is
 * stripped before the existence check. A trailing `#fragment` on a `.md` target
 * is checked too: it must name a heading in that file, because a link to a
 * renamed heading lands the reader at the top of the right document with nothing
 * to say they are in the wrong place. Fenced and inline code is stripped first
 * so illustrative snippets don't produce false positives.
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
 * The heading anchors GitHub would generate for a Markdown document.
 *
 * Modelled on `github-slugger`, which this repo does not depend on: lowercase,
 * trim, drop punctuation, then replace **each remaining space** with a hyphen.
 * That last step is per-character on purpose — `## Foo & Bar` becomes
 * `foo--bar`, with two hyphens, because removing `&` leaves the spaces either
 * side of it. Collapsing runs of whitespace instead would produce `foo-bar` and
 * report a correct link as broken.
 *
 * Known and deliberate gap: GitHub disambiguates repeated headings with `-1`,
 * `-2` suffixes and this does not, so two identically named headings both
 * resolve to the same anchor. That fails towards a false pass, never a false
 * alarm, which is the right direction for a gate.
 */
function headingAnchors(markdown) {
  // Fenced blocks only — NOT `stripCode`, which also removes inline-code
  // *content*: it turns `## \`AjaxResult\` paging helpers` into `##  paging
  // helpers`, dropping the first word of the slug. Both fence markers count;
  // stripping only backticks would let a `#` line inside a `~~~` block pass as
  // a heading.
  const withoutFences = markdown.replace(/(`{3,}|~{3,})[\s\S]*?\1/g, '')
  const anchors = new Set()

  // ATX. Up to three leading spaces still parse as a heading (four make it an
  // indented code block), and a space after the hashes is required.
  for (const match of withoutFences.matchAll(/^ {0,3}#{1,6}[ \t]([^\n]*)$/gm)) {
    // `## Title ##` — the closing hashes are decoration, not part of the text.
    anchors.add(slugify(match[1].replace(/[ \t]+#+[ \t]*$/, '')))
  }

  // Setext (`Title` over `===` or `---`), which anchors exactly like ATX.
  // Guarded against a table's `| --- |` row and against `---` frontmatter,
  // neither of which underlines a heading.
  for (const match of withoutFences.matchAll(/^(?!\s*$)([^\n|]+)\n {0,3}(?:={2,}|-{2,})[ \t]*$/gm)) {
    anchors.add(slugify(match[1]))
  }
  return anchors
}

/** One heading's text to its anchor. See {@link headingAnchors}. */
function slugify(headingText) {
  return headingText
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // link text, not the URL
    .toLowerCase()
    .trim()
    // Letters, numbers, spaces and hyphens survive; `\p{L}` rather than `\w`
    // so a Cyrillic or accented heading is not stripped to nothing.
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/ /g, '-')
}

/** `resolved path` → its anchors, so a file linked N times is parsed once. */
const anchorCache = new Map()

function anchorsFor(resolvedPath) {
  let anchors = anchorCache.get(resolvedPath)
  if (anchors === undefined) {
    anchors = headingAnchors(readFileSync(resolvedPath, 'utf8'))
    anchorCache.set(resolvedPath, anchors)
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
    // `#frag?query` puts the query inside the fragment; drop it either way round.
    const rawFragment = target.includes('#')
      ? target.slice(target.indexOf('#') + 1).replace(/\?.*$/, '')
      : ''
    if (rawFragment === '' || !path.endsWith('.md')) {
      continue
    }
    // Normalised the same way the slug is: GitHub resolves `#Section` against a
    // `## Section` heading, and a fragment written with percent-escapes (which
    // GitHub itself emits for non-ASCII headings) has to be decoded to match.
    let fragment = rawFragment.toLowerCase()
    try {
      fragment = decodeURIComponent(fragment)
    } catch {
      // A stray `%` that is not an escape — compare it as written.
    }
    if (!anchorsFor(resolved).has(fragment)) {
      broken += 1
      console.log(`\x1B[31mBROKEN\x1B[0m ${relative(ROOT, file)} → ${target} (no such heading in ${path})`)
    }
  }
}

console.log(`\nmd-internal-links: ${broken} broken link(s), ${checked} internal link(s) checked`)
process.exit(broken > 0 ? 1 : 0)
