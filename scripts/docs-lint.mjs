#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

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

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (full.endsWith('.md')) out.push(full)
  }
  return out
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return { frontmatter: {}, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { frontmatter: {}, body: text }
  const fm = text.slice(3, end).trim()
  const body = text.slice(end + 4).replace(/^\n/, '')
  // Minimal YAML parser sufficient for our frontmatter shape.
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
      // continuation of array item — append to last entry as a sub-line
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

function extractGithubLinkPaths(arrayItems) {
  // arrayItems are raw lines like "label: Foo\niconName: GitHubIcon\nto: https://github.com/..."
  const paths = []
  for (const entry of arrayItems) {
    const lines = entry.split('\n')
    const toLine = lines.find(l => l.startsWith('to:'))
    if (!toLine) continue
    const url = toLine.replace(/^to:\s*/, '').trim()
    if (url.startsWith(GITHUB_SOURCE_PREFIX)) {
      const local = url.slice(GITHUB_SOURCE_PREFIX.length).split('#')[0]
      paths.push(local)
    }
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
    const out = execSync(`git log -1 --format=%cI -- "${localPath}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    }).trim()
    return out || null
  } catch {
    return null
  }
}

function checkActionSkeleton(file, body) {
  const headings = body.split('\n').filter(l => l.startsWith('## '))
  // Required sections: must all be present; order must match.
  const presentRequired = []
  for (const required of REQUIRED_SECTIONS_FOR_ACTION_PAGES) {
    const idx = headings.indexOf(required)
    if (idx === -1) {
      log('error', file, `missing required section "${required}"`)
    } else {
      presentRequired.push({ section: required, idx })
    }
  }
  // Order check: indices of present required sections must be ascending.
  for (let i = 1; i < presentRequired.length; i++) {
    if (presentRequired[i].idx <= presentRequired[i - 1].idx) {
      log(
        'error',
        file,
        `section "${presentRequired[i].section}" must come after "${presentRequired[i - 1].section}"`
      )
    }
  }
  // Recommended.
  for (const recommended of RECOMMENDED_SECTIONS_FOR_ACTION_PAGES) {
    if (!headings.includes(recommended)) {
      log('warn', file, `recommended section "${recommended}" is missing`)
    }
  }
}

// Audit-freshness check applies to any page that opted in via
// `audited:` in its frontmatter, regardless of category.
function checkAuditFreshness(file, frontmatter) {
  if (!frontmatter.audited) return
  const auditedDate = new Date(frontmatter.audited + 'T23:59:59Z')
  const ghPaths = extractGithubLinkPaths(frontmatter.links || [])
  for (const localPath of ghPaths) {
    const lastCommit = gitLastCommitDate(localPath)
    if (!lastCommit) continue
    if (new Date(lastCommit) > auditedDate) {
      log(
        'warn',
        file,
        `source "${localPath}" was modified on ${lastCommit.slice(0, 10)}, after audited=${frontmatter.audited}`
      )
    }
  }
}

function main() {
  const files = walk(DOCS_ROOT)
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
  }
  console.log(`\ndocs-lint: ${errors} error(s), ${warnings} warning(s)`)
  if (errors > 0) process.exit(1)
  if (STRICT && warnings > 0) process.exit(1)
}

main()
