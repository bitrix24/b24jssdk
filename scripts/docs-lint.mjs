#!/usr/bin/env node

import { readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { walkMarkdownFiles, parseFrontmatter, isFreshnessTrackedSource } from './_docs-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const DOCS_ROOT = join(REPO_ROOT, 'docs', 'content', 'docs')

const REQUIRED_SECTIONS_FOR_ACTION_PAGES = [
  '## Overview',
  '## Method Signature',
  '## Examples',
  '## Alternatives and Recommendations'
]

const RECOMMENDED_SECTIONS_FOR_ACTION_PAGES = [
  '## Error Handling'
]

const ACTION_LIKE_CATEGORIES = new Set(['actions', 'tools'])

const GITHUB_SOURCE_PREFIX = 'https://github.com/bitrix24/b24jssdk/blob/main/'

const STRICT = process.argv.includes('--strict')

let errors = 0
let warnings = 0

function log(level, file, message) {
  const tag = level === 'error' ? '\x1B[31mERROR\x1B[0m' : '\x1B[33mWARN \x1B[0m'
  console.log(`${tag} ${relative(REPO_ROOT, file)}: ${message}`)
  if (level === 'error') errors++
  else warnings++
}

function extractGithubLinkPaths(arrayItems) {
  // arrayItems are raw lines like "label: Foo\niconName: GitHubIcon\nto: https://github.com/..."
  // We deliberately match only `blob/main/<file>` URLs: `tree/main/...` points
  // at a directory (can't be diffed against `git log -1` on a single path) and
  // `blob/<sha>/...` is pinned to a commit, so freshness has no meaning for it.
  // Defence: drop any extracted path that escapes the repo root via `..` or
  // resolves to an absolute filesystem location — otherwise a frontmatter `to:`
  // like `.../blob/main/../../etc/passwd` would let docs-lint stat arbitrary
  // files. `execFileSync` already neutralises shell-metacharacter injection,
  // so the worst remaining outcome is a path-traversal probe.
  const paths = []
  for (const entry of arrayItems) {
    const lines = entry.split('\n')
    const toLine = lines.find(l => l.startsWith('to:'))
    if (!toLine) continue
    const url = toLine.replace(/^to:\s*/, '').trim()
    if (!url.startsWith(GITHUB_SOURCE_PREFIX)) continue
    const local = url.slice(GITHUB_SOURCE_PREFIX.length).split('#')[0]
    if (!local || local.startsWith('/') || local.startsWith('\\')) continue
    if (local.split(/[/\\]/).includes('..')) continue
    paths.push(local)
  }
  return paths
}

function gitLastCommitDate(localPath) {
  const abs = join(REPO_ROOT, localPath)
  try {
    statSync(abs)
  } catch {
    return null // file doesn't exist locally — skip silently
  }
  try {
    // execFileSync (not execSync) — `localPath` comes from frontmatter and is
    // whitelisted by GITHUB_SOURCE_PREFIX, but a misbehaving link should never
    // be able to inject shell metacharacters.
    const out = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', localPath],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim()
    return out || null
  } catch {
    return null
  }
}

function checkActionSkeleton(file, body) {
  // Use the heading text (trimmed) as the comparison key so a trailing space
  // on the markdown side doesn't make the contract fail surprisingly.
  const headings = body
    .split('\n')
    .filter(l => l.startsWith('## '))
    .map(l => l.trimEnd())
  const presentRequired = []
  for (const required of REQUIRED_SECTIONS_FOR_ACTION_PAGES) {
    const idx = headings.indexOf(required)
    if (idx === -1) {
      log('error', file, `missing required section "${required}"`)
    } else {
      presentRequired.push({ section: required, idx })
    }
  }
  for (let i = 1; i < presentRequired.length; i++) {
    if (presentRequired[i].idx <= presentRequired[i - 1].idx) {
      log(
        'error',
        file,
        `section "${presentRequired[i].section}" appears before "${presentRequired[i - 1].section}" — reorder so the page reads ${REQUIRED_SECTIONS_FOR_ACTION_PAGES.join(' → ')}`
      )
    }
  }
  for (const recommended of RECOMMENDED_SECTIONS_FOR_ACTION_PAGES) {
    if (!headings.includes(recommended)) {
      log('warn', file, `recommended section "${recommended}" is missing`)
    }
  }
}

// Audit-freshness check applies to any page that opted in via `audited:` in its
// frontmatter, regardless of category. Only non-Markdown link targets are
// tracked — Markdown sources (`.md`/`.mdx`: skills, AGENTS.md, CHANGELOG.md) are
// parallel docs, not the API source of truth, so they don't age a page's audit
// (see `isFreshnessTrackedSource`). This avoids a 1→N `audited:` bump cascade
// whenever a widely-cited skill or the changelog is edited.
export function checkAuditFreshness(file, frontmatter, deps = {}) {
  if (!frontmatter.audited) return
  // Dependency seams so tests can exercise the skip logic without a git history.
  const getCommitDate = deps.getCommitDate || gitLastCommitDate
  const warn = deps.warn || ((f, m) => log('warn', f, m))
  const auditedDate = new Date(frontmatter.audited + 'T23:59:59Z')
  const ghPaths = extractGithubLinkPaths(frontmatter.links || [])
  for (const localPath of ghPaths) {
    if (!isFreshnessTrackedSource(localPath)) continue
    const lastCommit = getCommitDate(localPath)
    if (!lastCommit) continue
    if (new Date(lastCommit) > auditedDate) {
      warn(
        file,
        `source "${localPath}" was modified on ${lastCommit.slice(0, 10)}, after audited=${frontmatter.audited}`
      )
    }
  }
}

// Frontmatter `links:` point at the source files a page documents. A renamed or
// deleted target leaves a dead pointer that neither tsc nor the snippet checks
// catch — error on any blob/main link whose file no longer exists (#117).
export function checkFrontmatterLinkTargets(file, frontmatter, deps = {}) {
  const exists = deps.exists || (localPath => existsSync(join(REPO_ROOT, localPath)))
  const error = deps.error || ((f, m) => log('error', f, m))
  for (const localPath of extractGithubLinkPaths(frontmatter.links || [])) {
    if (!exists(localPath)) {
      error(file, `frontmatter links: target "${localPath}" does not exist in the repo`)
    }
  }
}

// Threshold above which the number of @check-ignore markers triggers a warning.
// The current baseline is 38 (as of v1.1.3). Raise deliberately when new
// opt-outs are added; do not let this number creep up silently.
const CHECK_IGNORE_WARN_THRESHOLD = 50

function countCheckIgnoreMarkers(files) {
  let total = 0
  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    const matches = raw.match(/\/\/ @check-ignore/g)
    if (matches) total += matches.length
  }
  return total
}

function main() {
  const files = walkMarkdownFiles(DOCS_ROOT)
  for (const file of files) {
    const raw = readFileSync(file, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const category = frontmatter.category
    if (ACTION_LIKE_CATEGORIES.has(category)) {
      checkActionSkeleton(file, body)
      if (!frontmatter.audited) {
        log('warn', file, `missing frontmatter "audited: YYYY-MM-DD"`)
      }
    }
    checkAuditFreshness(file, frontmatter)
    checkFrontmatterLinkTargets(file, frontmatter)
  }

  const ignoreCount = countCheckIgnoreMarkers(files)
  if (ignoreCount > CHECK_IGNORE_WARN_THRESHOLD) {
    log(
      'warn',
      join(DOCS_ROOT, '..'),
      `@check-ignore markers: ${ignoreCount} (threshold ${CHECK_IGNORE_WARN_THRESHOLD}) — review whether some can be replaced with real fixes`
    )
  }

  console.log(`\ndocs-lint: ${errors} error(s), ${warnings} warning(s)`)
  if (errors > 0) process.exit(1)
  if (STRICT && warnings > 0) process.exit(1)
}

// Run only when executed directly (e.g. `node scripts/docs-lint.mjs`), not when
// imported by tests (which exercise the exported helpers in isolation).
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main()
}
