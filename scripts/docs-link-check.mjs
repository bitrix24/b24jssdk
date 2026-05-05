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

function buildValidUrls(files) {
  const set = new Set()
  for (const file of files) set.add(fileToUrl(file))
  return set
}

function normalizeUrl(url) {
  // Drop fragment, ensure trailing slash for path-only URLs.
  const noFragment = url.split('#')[0]
  if (!noFragment) return ''
  return noFragment.endsWith('/') ? noFragment : `${noFragment}/`
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

function main() {
  const files = walk(DOCS_ROOT)
  const validUrls = buildValidUrls(files)

  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    const fm = extractFrontmatter(raw)
    const body = raw.slice(fm.length ? fm.length + 8 : 0) // skip `---\n…\n---\n`

    const links = [
      ...extractInternalLinksFromFrontmatter(fm),
      ...extractInternalLinksFromBody(body)
    ]

    for (const link of links) {
      const target = normalizeUrl(link)
      if (!validUrls.has(target)) {
        logError(file, `broken internal link "${link}" -> "${target}" (no matching page)`)
      }
    }
  }

  console.log(`\ndocs-link-check: ${errors} broken link(s)`)
  if (errors > 0) process.exit(1)
}

main()
