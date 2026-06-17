#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkMarkdownFiles, parseFrontmatter } from './_docs-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DOCS_ROOT = process.env.DOCS_LINK_CHECK_ROOT
  ? resolve(process.env.DOCS_LINK_CHECK_ROOT)
  : join(REPO_ROOT, 'docs', 'content', 'docs')
const URL_PREFIX = '/docs/'

let errors = 0
let warnings = 0

function logError(file, message) {
  console.log(`\x1B[31mERROR\x1B[0m ${relative(REPO_ROOT, file)}: ${message}`)
  errors++
}

function logWarn(file, message) {
  console.log(`\x1B[33mWARN \x1B[0m ${relative(REPO_ROOT, file)}: ${message}`)
  warnings++
}

// Map a file path under DOCS_ROOT to its public URL.
// `1.getting-started/2.installation/3.react.md`
//   -> `/docs/getting-started/installation/react/`
// `99.examples/0.index.md` -> `/docs/examples/`
function fileToUrl(file) {
  const rel = relative(DOCS_ROOT, file).replaceAll('\\', '/')
  const segments = rel.split('/').map(s => s.replace(/^\d+\./, ''))
  const lastIndex = segments.length - 1
  const last = segments[lastIndex].replace(/\.md$/, '')
  if (last === 'index') {
    segments.pop()
  } else {
    segments[lastIndex] = last
  }
  return `${URL_PREFIX}${segments.join('/')}${segments.length ? '/' : ''}`
}

// Slug a heading the way `github-slugger` (used by Nuxt Content) does:
// lowercase, strip everything that isn't a word char, whitespace or hyphen,
// then turn each whitespace char into a single hyphen. Adjacent hyphens are
// preserved so "A  B" -> "a--b" (matches Nuxt Content's runtime behaviour).
function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-')
}

// Build the slug set, mirroring github-slugger's collision behaviour: the
// first occurrence keeps the bare slug, subsequent ones get `-1`, `-2`, …
// suffixes. We still warn on collisions because the bare slug is the natural
// link target — readers usually want a distinct heading rather than the
// disambiguated suffix — but the suffixed slugs are still indexed so explicit
// `#foo-1` links validate correctly.
function extractHeadings(file, body) {
  const slugs = new Set()
  for (const line of body.split('\n')) {
    const prefix = line.match(/^#{1,6}\s/)
    if (!prefix) continue
    const text = line.slice(prefix[0].length).trim()
    if (!text) continue
    const base = slugifyHeading(text)
    if (!slugs.has(base)) {
      slugs.add(base)
      continue
    }
    let counter = 1
    let suffixed = `${base}-${counter}`
    while (slugs.has(suffixed)) suffixed = `${base}-${++counter}`
    slugs.add(suffixed)
    logWarn(
      file,
      `heading "${text}" collides with an earlier heading on the same page; github-slugger will emit "${suffixed}" for it. Plain links to "#${base}" will hit the earlier one.`
    )
  }
  return slugs
}

function buildPageIndex(files) {
  // url -> { headings: Set<slug> }
  const index = new Map()
  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    const { body } = parseFrontmatter(raw)
    index.set(fileToUrl(file), { headings: extractHeadings(file, body) })
  }
  return index
}

function splitUrlAndFragment(url) {
  const hashIdx = url.indexOf('#')
  if (hashIdx === -1) return { path: url, fragment: '' }
  return { path: url.slice(0, hashIdx), fragment: url.slice(hashIdx + 1) }
}

function normalizePath(path) {
  if (!path) return ''
  return path.endsWith('/') ? path : `${path}/`
}

function extractInternalLinksFromBody(body) {
  // Matches markdown link targets like `](/docs/foo/bar/)` or `](/docs/foo#hash)`.
  // We use a non-greedy capture and stop at `)`, whitespace, or `"` to be safe.
  const re = /\]\((\/docs\/[^\s)"#]*(?:#[^\s)"#]+)?)\)/g
  const out = []
  let m
  while ((m = re.exec(body)) !== null) out.push(m[1])
  return out
}

function extractRelativeLinksFromBody(body) {
  // Nuxt Content internal links must be site-absolute (/docs/…). A ./ or ../
  // relative target silently fails to resolve at build time. (#102)
  const re = /\]\((\.\.?\/[^\s)"]*)\)/g
  const out = []
  let m
  while ((m = re.exec(body)) !== null) out.push(m[1])
  return out
}

function extractInternalLinksFromLinksArray(linksArray) {
  // The frontmatter `links:` array is parsed into raw entry strings like
  // "label: Foo\niconName: GitHubIcon\nto: /docs/foo/". Pull each `to:` line
  // and keep only entries that target the local doc site.
  const out = []
  for (const entry of linksArray) {
    for (const line of entry.split('\n')) {
      const colon = line.indexOf('to:')
      if (colon !== 0) continue
      const value = line.slice(3).trim().replace(/^['"]|['"]$/g, '')
      if (value.startsWith(URL_PREFIX)) out.push(value)
    }
  }
  return out
}

// Resolve a link's path component to a page URL in the page index.
// The link itself may target the *current* page via `#fragment` (no path),
// in which case we treat the link as same-page.
function resolveLinkTarget(link, sourceUrl) {
  const { path, fragment } = splitUrlAndFragment(link)
  const targetUrl = path ? normalizePath(path) : sourceUrl
  return { targetUrl, fragment }
}

function main() {
  const files = walkMarkdownFiles(DOCS_ROOT)
  const pageIndex = buildPageIndex(files)

  for (const file of files) {
    const sourceUrl = fileToUrl(file)
    const raw = readFileSync(file, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)

    const links = [
      ...extractInternalLinksFromLinksArray(frontmatter.links || []),
      ...extractInternalLinksFromBody(body)
    ]

    for (const link of links) {
      const { targetUrl, fragment } = resolveLinkTarget(link, sourceUrl)
      const page = pageIndex.get(targetUrl)
      if (!page) {
        logError(file, `broken internal link "${link}" -> "${targetUrl}" (no matching page)`)
        continue
      }
      if (fragment && !page.headings.has(fragment)) {
        logError(
          file,
          `broken fragment in link "${link}" — "#${fragment}" is not a heading on ${targetUrl}`
        )
      }
    }

    for (const rel of extractRelativeLinksFromBody(body)) {
      logError(file, `relative link "${rel}" — docs links must be site-absolute (/docs/…), not ./ or ../`)
    }
  }

  console.log(`\ndocs-link-check: ${errors} broken link(s), ${warnings} warning(s)`)
  if (errors > 0) process.exit(1)
}

main()
