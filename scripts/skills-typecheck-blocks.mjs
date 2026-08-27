#!/usr/bin/env node

/**
 * Type-checks the ```ts / ```typescript fences in `skills/*\/SKILL.md` (#402).
 *
 * Why this exists separately from the docs gate: skill files are what an AI
 * agent reads BEFORE writing code, so a broken snippet there is not a page a
 * human might misread — it is a template that gets reproduced. `docs-typecheck`
 * has guarded the documentation site since #109; the skills had nothing, and it
 * showed. #401 found them teaching `LoggerBrowser`, removed in 3.0.0, for
 * months. The first run of THIS gate found a class the documentation gives its
 * own page to and the package does not export at all.
 *
 * It also generalises: the substring guards in
 * `test/integration/skills-recipes/recipe-hygiene.unit.spec.ts` catch one named
 * symbol each, so every deprecation needs a new guard. A compiler covers the
 * whole surface at once — which matters for #277, whose removal list is 22
 * symbols long.
 *
 * Extraction, `// @check-ignore` handling and diagnostic mapping are shared with
 * the docs gate — see `_typecheck-blocks.mjs`. What differs is only the file
 * list and `.skills-typecheck/globals.d.ts`, whose header explains what may and
 * may not be declared there.
 *
 * Prerequisites: pnpm install && pnpm run dev:prepare (creates dist/ for jssdk types).
 */

import { readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requireSdkTypes } from './_require-sdk-types.mjs'
import { checkBlocks } from './_typecheck-blocks.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

requireSdkTypes('skills:typecheck-blocks')

// Discovered, not listed. A hand-maintained list of skill files went stale once
// already (#401): four of the seven were unguarded and nobody noticed, because
// "every listed file exists" says nothing about whether the list is complete.
// `isDirectory()` reports the dirent's own type, so a symlinked skill needs the
// second test or it is silently skipped.
const SKILLS_DIR = join(REPO_ROOT, 'skills')
const files = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
  .map(entry => join(SKILLS_DIR, entry.name, 'SKILL.md'))
  .filter(existsSync)

process.exit(checkBlocks({
  label: 'skills-typecheck',
  repoRoot: REPO_ROOT,
  checkDir: join(REPO_ROOT, '.skills-typecheck'),
  files
}))
