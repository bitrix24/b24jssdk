#!/usr/bin/env node

import { readFileSync, statSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { walkMarkdownFiles, parseFrontmatter, isFreshnessTrackedSource } from './_docs-utils.mjs'
import { createReporter } from './_reporter.mjs'

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

/**
 * Options shared by every `git` call here.
 *
 * `GIT_DIR` beats `cwd`, so an inherited one — from a hook, a CI wrapper, a
 * `git bisect run` — would silently point these checks at a different
 * repository than the one being linted. Clearing it makes `cwd: REPO_ROOT` mean
 * what it says.
 *
 * `GIT_WORK_TREE` and `GIT_INDEX_FILE` are cleared with it rather than on their
 * own account: git honours neither unless `GIT_DIR` is also set (measured, not
 * assumed), so they cannot do damage alone — but git sets all three together
 * for a hook or a rebase, and clearing one of a matched set is how you end up
 * with `git status` reading one repository's index against another's tree.
 *
 * git's own `fatal:` lines are dropped: every call here treats failure as an
 * answer rather than an error, so the diagnostics would only paste noise above
 * an otherwise-clean report.
 */
const GIT_EXEC_OPTIONS = {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_INDEX_FILE: undefined },
  stdio: ['ignore', 'pipe', 'ignore']
}

const STRICT = process.argv.includes('--strict')

const report = createReporter({ label: 'docs-lint', root: REPO_ROOT })

function log(level, file, message) {
  if (level === 'error') {
    report.error(file, message)
  } else {
    report.warn(file, message)
  }
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

/**
 * Paths with uncommitted changes, as one lookup for the whole run.
 *
 * One `git status` for the repository instead of one per cited link: there are
 * ~84 audited links, and a spawn each doubled the process count of the script
 * for information a single call already contains.
 *
 * Built lazily, so runs that never reach a freshness check pay nothing.
 */
/**
 * Parse `git status --porcelain` into the set of paths it reports.
 *
 * Exported and pure so the parsing is testable without dirtying a real file:
 * proving the rename and quoting cases by making the repository actually
 * contain them would be far more hazardous than the bug it guards.
 *
 * Each line is `XY path`, or `XY old -> new` for a rename — the destination is
 * the path that now exists. Paths containing a space or a non-ASCII byte come
 * back quoted.
 */
export function parseDirtyPaths(porcelain) {
  const paths = new Set()
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue
    const parts = line.slice(3).trim().split(' -> ')
    paths.add(parts[parts.length - 1].replace(/^"|"$/g, ''))
  }
  return paths
}

let dirtyPaths = null
function isDirty(localPath) {
  if (dirtyPaths === null) {
    try {
      dirtyPaths = parseDirtyPaths(
        execFileSync('git', ['status', '--porcelain'], GIT_EXEC_OPTIONS)
      )
    } catch {
      // No git, or not a repository. Freshness then rests on `git log` alone,
      // which is what this check did before.
      dirtyPaths = new Set()
    }
  }
  return dirtyPaths.has(localPath)
}

export function gitLastCommitDate(localPath, isDirtyImpl = isDirty) {
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
      GIT_EXEC_OPTIONS
    ).trim()

    // An uncommitted edit counts as "modified now".
    //
    // Without this the check reads only committed history, so running it with a
    // cited source modified-but-not-yet-committed reports on a state that no
    // longer exists — it passes locally and then fails in CI the moment the
    // commit lands. That happened twice in a row, the second time immediately
    // after the lesson was written down, which is the evidence that "remember to
    // run it after committing" is not a workable rule. Reading the working tree
    // makes the local run agree with CI whatever the commit state.
    if (isDirtyImpl(localPath)) {
      return new Date().toISOString()
    }

    // Exists on disk, yet git knows no commit for it — it is gitignored, and
    // `git status --porcelain` does not list an ignored path either. Both of
    // this function's signals are blind to it, so the audit cannot be vouched
    // for against history at all: warn rather than skip the page in silence,
    // which was the previous behaviour and the least useful of the three.
    return out || new Date().toISOString()
  } catch {
    return null
  }
}

/**
 * Is this a shallow clone (`--depth`, or a container that cloned truncated)?
 *
 * It decides whether the freshness check can run at all. `git log -1 -- <file>`
 * has no honest answer for a file that was not touched inside the downloaded
 * commits, and rather than saying so it returns the date of the shallow
 * boundary — the graft commit. The freshness check then compares that boundary
 * against `audited:` and reports pages as stale that are not.
 *
 * Measured on a `--depth 20` clone of this repository: 22 warnings, every one
 * of them naming the boundary date, none of them real. It reads as plausible —
 * twenty-two pages going stale on one day is the only clue — and it cost a real
 * detour before the repeated date gave it away (#524).
 *
 * The truncation cuts the other way too, which is the more expensive half: a
 * page whose source genuinely moved *before* the boundary is invisible, so a
 * shallow run reporting `0 warnings` is evidence about nothing.
 *
 * @param {(cmd: string, args: string[], opts: object) => string} [execImpl]
 * @returns {boolean} false when git cannot be asked at all — the freshness
 *   check is then no worse off than it was before this existed.
 */
export function isShallowRepository(execImpl = execFileSync) {
  try {
    return execImpl('git', ['rev-parse', '--is-shallow-repository'], GIT_EXEC_OPTIONS).trim() === 'true'
  } catch {
    // git missing, not a repository, or refusing the directory as
    // "dubious ownership": `false` keeps the freshness check no worse off than
    // it was before this existed. It does NOT mean the check then has an
    // answer — every `git log` will fail the same way — which is why the
    // summary counts comparisons that actually happened rather than pages that
    // asked for one.
    return false
  }
}

const UNSHALLOW_HINT = 'run `git fetch --unshallow` to check it'

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
  if (!frontmatter.audited) return { asked: 0, compared: 0 }
  // Dependency seams so tests can exercise the skip logic without a git history.
  const getCommitDate = deps.getCommitDate || (path => gitLastCommitDate(path, deps.isDirty))
  const warn = deps.warn || ((f, m) => log('warn', f, m))
  const auditedDate = new Date(frontmatter.audited + 'T23:59:59Z')
  const ghPaths = extractGithubLinkPaths(frontmatter.links || [])
  // Both numbers are returned, and the distance between them is the point.
  //
  // `asked` counts the freshness-tracked sources this page cites; `compared`
  // counts the ones git actually answered for. A page that cites none has
  // nothing to check and is not a problem. A page that cites several and gets
  // no answer means git could not be read — and telling those two apart is the
  // difference between an accurate report and confidently sending a reader
  // after a git problem that does not exist (#524).
  let asked = 0
  let compared = 0

  for (const localPath of ghPaths) {
    if (!isFreshnessTrackedSource(localPath)) continue
    asked++
    const lastCommit = getCommitDate(localPath)
    if (!lastCommit) continue
    compared++
    if (new Date(lastCommit) > auditedDate) {
      warn(
        file,
        `source "${localPath}" was modified on ${lastCommit.slice(0, 10)}, after audited=${frontmatter.audited}`
      )
    }
  }

  return { asked, compared }
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
//
// 50 -> 51 (#356): the Nuxt slider-routing middleware on the frame-slider page.
// It is built from Nuxt auto-imports and two app-level helpers, none of which
// exist in the isolated context this check compiles in — un-checkable rather
// than unfixed, which is what the marker is for.
//
// 51 -> 57 (#463): six placeholders — `some.method`, `some.list` — in migration
// and error-handling snippets, now that the v3 method-name gate reads the same
// marker. They are deliberately not portal methods, which is the whole point of
// the snippet, and the ten *real* wrong names that gate found were fixed rather
// than marked. Two of the six extended a marker that already existed for the
// typecheck pass, so the marker count rose by four, not six.
//
// 57 -> 58 (#467): `some.entity.aggregate` in the 2.x migration page. There is
// no real name to use instead — no shipped Bitrix24 module publishes an
// `*.aggregate` action on any portal checked, which is the reason the action is
// still `@experimental` and the reason the snippet needs a placeholder at all.
//
// 58 -> 59 (#277): the `getTotal()` progress snippet on the 3.0.0 migration page.
// It shows how to replace `callListMethod`'s removed `progress` callback, so it
// deliberately opens mid-story with a `$b24` the reader already has — declaring
// a client would bury the one line the snippet exists to show.
const CHECK_IGNORE_WARN_THRESHOLD = 59

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

  // Decided once, not per page: the answer cannot change mid-run, and a
  // per-page "possibly a shallow-clone artefact" would be closer to noise than
  // to signal. Skipping outright is the honest option — for a gate people
  // trust, a wrong answer is worse than no answer (#524).
  const shallow = isShallowRepository()
  if (shallow) {
    // A note, not a warning — deliberately, and it took a review round to get
    // right. `--strict` runs in exactly one place, the CI job that checks out
    // with `fetch-depth: 0`, so a warning here can NEVER fire where the gate is
    // enforced and can ONLY fire where it is wrong: a contributor's shallow
    // checkout, a container, someone offline who cannot fetch at all. For them
    // `--strict` would stop meaning "my docs are in order" and start meaning
    // "my clone is deep enough".
    //
    // Nothing is lost by declining to fail: the thing worth preventing is a
    // reader taking `0 warnings` for a clean bill of health, and the summary
    // note below says otherwise on every run, with or without `--strict`.
    //
    // `check-v3-method-refs.mjs` answers the same shape of problem — a
    // sub-check that cannot run for an environmental reason, fixed by one local
    // command — with a note as well. Two gates answering "this did not run"
    // with two different exit codes is the divergence #418 existed to stop.
    console.log(
      'docs-lint: audit freshness was not checked — this clone has only part of the git history, '
      + 'so `git log` cannot tell when a source file really last changed. '
      + 'To check it: git fetch --unshallow && node scripts/docs-lint.mjs'
    )
  }

  // Pages whose `audited:` stamp was actually compared against something, not
  // pages that carry one. Some of this repo's stamped pages cite no
  // freshness-tracked source, and a git that cannot answer at all produces zero
  // comparisons while every page still asks — which would print a clean bill of
  // health for a check that examined nothing (#524).
  let pagesCompared = 0
  let pagesStamped = 0
  // Sources, not pages: `sourcesAsked - sourcesCompared` is exactly the number
  // git failed to answer for, with no threshold to tune and nothing to rot.
  let sourcesAsked = 0
  let sourcesCompared = 0

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
    if (frontmatter.audited) pagesStamped++

    if (!shallow) {
      const { asked, compared } = checkAuditFreshness(file, frontmatter)
      sourcesAsked += asked
      sourcesCompared += compared
      if (compared > 0) pagesCompared++
    }

    checkFrontmatterLinkTargets(file, frontmatter)
  }

  // Say what was looked at, so a clean run cannot be misread as a clean bill of
  // health on something that was never examined — same reasoning as #519.
  if (shallow) {
    report.note(`audit freshness NOT CHECKED (partial git history — ${UNSHALLOW_HINT})`)
  } else if (sourcesAsked === 0) {
    // Nothing cited a freshness-tracked source. Not a git problem, and saying
    // it were one would send a reader after a fault that does not exist.
    report.note('audit freshness had nothing to check (no page cites a non-Markdown source)')
  } else if (sourcesCompared === 0) {
    // Sources were cited and git answered for none of them: it could not be
    // asked at all — missing, not a repository, or refusing the directory as
    // "dubious ownership", which is ordinary in a container whose checkout is
    // mounted with a different owner. Saying "0 page(s) checked" would be true
    // but easy to skim past; saying it did not run is the same honesty the
    // shallow branch owes.
    console.log(
      'docs-lint: audit freshness was not checked — git answered for none of the '
      + `${sourcesAsked} cited source(s). Is this a git repository, and is git able to read it?`
    )
    report.note('audit freshness NOT CHECKED (git answered for no source)')
  } else {
    if (sourcesCompared < sourcesAsked) {
      // A partial answer is the quiet failure: the count below stays truthful,
      // but "2 of 52" is easy to read past. Name the gap rather than leave it
      // to be noticed. No threshold is involved — a source that was asked
      // about and not answered for is a fact, not a heuristic.
      console.log(
        `docs-lint: audit freshness is incomplete — git answered for ${sourcesCompared} `
        + `of ${sourcesAsked} cited source(s); the rest were not checked.`
      )
      report.note(`${sourcesAsked - sourcesCompared} cited source(s) UNANSWERED by git`)
    }

    report.note(`${pagesCompared} of ${pagesStamped} page(s) with audited: compared against git`)
  }

  const ignoreCount = countCheckIgnoreMarkers(files)
  if (ignoreCount > CHECK_IGNORE_WARN_THRESHOLD) {
    log(
      'warn',
      join(DOCS_ROOT, '..'),
      `@check-ignore markers: ${ignoreCount} (threshold ${CHECK_IGNORE_WARN_THRESHOLD}) — review whether some can be replaced with real fixes`
    )
  }

  process.exit(report.finish({ strict: STRICT }))
}

// Run only when executed directly (e.g. `node scripts/docs-lint.mjs`), not when
// imported by tests (which exercise the exported helpers in isolation).
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main()
}
