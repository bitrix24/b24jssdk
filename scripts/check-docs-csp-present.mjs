#!/usr/bin/env node

/**
 * Asserts the documentation site's CSP survived the build (#399).
 *
 * The browser-based counterpart, `check-docs-csp.mjs`, answers "is the policy
 * too strict?" — it needs Playwright and a person to run it. This answers the
 * cheaper and more likely question, "is the policy still there and still
 * covering the page?", needs nothing but the generated output, and runs in the
 * `docs-build` job on every PR.
 *
 * Three properties, each with a failure that is otherwise silent:
 *
 *   present  a refactor drops `docs/server/plugins/csp.ts`, or an upstream sync
 *            overwrites it. Nothing else in the build notices.
 *   once     two `<meta>` policies are both enforced and a resource must satisfy
 *            the intersection, so a duplicate makes the site mysteriously
 *            stricter rather than obviously broken.
 *   first    a `<meta>` policy governs only what the parser reaches after it.
 *            The tag sat 158 tags deep until #399 moved it, leaving the import
 *            map, the critical CSS and 143 modulepreload hints outside the
 *            policy. A head-ordering change could put it back there.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.DOCS_CSP_ROOT
  ? resolve(process.env.DOCS_CSP_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', '.output', 'public')

const TAG = /<meta[^>]+http-equiv="Content-Security-Policy"[^>]*>/gi

/**
 * Directives whose loss would be a regression rather than a deliberate
 * tightening. Not the whole policy: this check is about the tag surviving, and
 * pinning every source here would make an intentional change fail twice.
 */
const REQUIRED = [`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`]

function htmlFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...htmlFiles(full))
    } else if (entry.name.endsWith('.html')) {
      files.push(full)
    }
  }
  return files
}

if (!existsSync(ROOT)) {
  console.error(`docs-csp-present: no built site at ${ROOT}. Run \`pnpm run docs:generate\` first.`)
  process.exit(1)
}

const pages = htmlFiles(ROOT)
if (pages.length === 0) {
  console.error('docs-csp-present: the built site contains no HTML pages')
  process.exit(1)
}

const problems = []

for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const where = relative(ROOT, file)
  const headStart = html.indexOf('<head>')
  if (headStart < 0) {
    problems.push(`${where}: no <head>`)
    continue
  }
  const head = html.slice(headStart + '<head>'.length, html.indexOf('</head>'))
  const matches = head.match(TAG) ?? []

  if (matches.length === 0) {
    problems.push(`${where}: no Content-Security-Policy meta tag`)
    continue
  }
  if (matches.length > 1) {
    problems.push(`${where}: ${matches.length} CSP meta tags — both are enforced, as their intersection`)
  }
  const preceding = head.slice(0, head.search(TAG)).trim()
  if (preceding !== '') {
    problems.push(`${where}: the CSP is not first in <head>; "${preceding.slice(0, 70)}" precedes it`)
  }
  for (const directive of REQUIRED) {
    if (!matches[0].includes(directive)) {
      problems.push(`${where}: the policy no longer contains ${directive}`)
    }
  }
}

for (const problem of problems.slice(0, 20)) {
  console.log(`CSP ${problem}`)
}
if (problems.length > 20) {
  console.log(`… and ${problems.length - 20} more`)
}

console.log(`docs-csp-present: ${problems.length} problem(s) across ${pages.length} page(s)`)
process.exit(problems.length > 0 ? 1 : 0)
