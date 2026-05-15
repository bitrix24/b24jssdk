#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DOCS_ROOT = join(REPO_ROOT, 'docs', 'content', 'docs')
const URL_PREFIX = '/docs/'

let errors = 0

function logError(file, message) {
  console.log(`\x1B[31mERROR\x1B[0m ${relative(REPO_ROOT, file)}: ${message}`)
  errors++
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.md')) out.push(full)
  }
  return out
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
// then collapse runs of whitespace into single hyphens.
function slugifyHeading(text) {
  // Match github-slugger semantics: each whitespace char becomes a single
  // hyphen (so "A  B" -> "a--b", not "a-b"). Don't collapse adjacent hyphens.
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s/g, '-')
}

function extractHeadings(body) {
  const slugs = new Set()
  for (const line of body.split('\n')) {
    const prefix = line.match(/^#{1,6}\s/)
    if (!prefix) continue
    const text = line.slice(prefix[0].length).trim()
    if (!text) continue
    slugs.add(slugifyHeading(text))
  }
  return slugs
}

function buildPageIndex(files) {
  // url -> { headings: Set<slug> }
  const index = new Map()
  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    const body = stripFrontmatter(raw)
    index.set(fileToUrl(file), { headings: extractHeadings(body) })
  }
  return index
}

function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end === -1) return text
  return text.slice(end + 4).replace(/^\n/, '')
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

function extractFrontmatter(text) {
  if (!text.startsWith('---')) return ''
  const end = text.indexOf('\n---', 3)
  if (end === -1) return ''
  return text.slice(3, end)
}

function extractInternalLinksFromFrontmatter(fm) {
  // Frontmatter `to:` values that point at /docs/...
  const out = []
  for (const line of fm.split('\n')) {
    const idx = line.indexOf('to:')
    if (idx === -1) continue
    const value = line.slice(idx + 3).trim().replace(/^['"]|['"]$/g, '')
    if (value.startsWith(URL_PREFIX)) out.push(value)
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
  const files = walk(DOCS_ROOT)
  const pageIndex = buildPageIndex(files)

  for (const file of files) {
    const sourceUrl = fileToUrl(file)
    const raw = readFileSync(file, 'utf8')
    const fm = extractFrontmatter(raw)
    const body = stripFrontmatter(raw)

    const links = [
      ...extractInternalLinksFromFrontmatter(fm),
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
  }

  console.log(`\ndocs-link-check: ${errors} broken link(s)`)
  if (errors > 0) process.exit(1)
}

main()
