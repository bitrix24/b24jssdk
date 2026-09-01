#!/usr/bin/env node

/**
 * Type-checks the ```ts / ```typescript fences in `.github/contributing/**.md` (#435).
 *
 * The third caller of the same engine, and the last gap in fence coverage.
 * `docs:typecheck-blocks` has guarded the documentation site since #109,
 * `skills:typecheck-blocks` the agent-facing skill files since #402, and
 * `jsdoc:typecheck-blocks` the `@example` bodies since #439. The contributor
 * guides had nothing — measured, not assumed: #419 injected a type error into a
 * fence in `transports-and-results.md` and all ten passes stayed green.
 *
 * The gap was hidden by a pass that looked like it closed it. `contributing:typecheck`
 * compiled twelve hand-written fixtures under `test/some-code-from-docs/contributing/`
 * whose names mirror the guides, and nothing checked that a fixture still matched
 * the fence it was copied from — so the two could drift apart silently, in either
 * direction. That pass was removed in #429 once `test:typecheck` covered the same
 * files; this gate compiles the guides themselves instead of a copy of them.
 *
 * Those fixtures stay. Their `.spec.ts` neighbours assert runtime behaviour,
 * which is a different question from whether the guide compiles, and they are
 * covered by `test:typecheck` under stricter settings than they ever had here.
 *
 * Extraction, `// @check-ignore` handling and diagnostic mapping are shared with
 * the other three gates — see `_typecheck-blocks.mjs`. What differs is only the
 * file list and `.contributing-typecheck/globals.d.ts`, whose header explains
 * what may and may not be declared there.
 *
 * Prerequisites: pnpm install && pnpm run dev:prepare (creates dist/ for jssdk types).
 */

import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireSdkTypes } from './_require-sdk-types.mjs'
import { checkBlocks } from './_typecheck-blocks.mjs'
import { walkMarkdownFiles } from './_docs-utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

requireSdkTypes('contributing:typecheck-blocks')

// Walked, not listed. The guides are added to and split regularly — #420 plans
// to move more code-adjacent prose into them — and a hand-maintained list went
// stale once already in this repository (#401).
const files = walkMarkdownFiles(join(REPO_ROOT, '.github', 'contributing'))

process.exit(checkBlocks({
  label: 'contributing-typecheck',
  repoRoot: REPO_ROOT,
  checkDir: join(REPO_ROOT, '.contributing-typecheck'),
  files
}))
