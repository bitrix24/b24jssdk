#!/usr/bin/env node

/**
 * Type-checks all ```ts / ```typescript fenced blocks in docs/content/docs/**\/*.md
 * against the live @bitrix24/b24jssdk package types.
 *
 * Design:
 *  - Each block is written as a standalone .ts file in .docs-typecheck/tmp/.
 *  - .docs-typecheck/globals.d.ts provides ambient declarations for $b24, $logger,
 *    and ImportMeta extensions so short snippets compile without their own imports.
 *  - tsc runs against .docs-typecheck/tsconfig.json, which includes both
 *    globals.d.ts and all generated block files.
 *  - Error locations are mapped back to the original .md file:line:col.
 *
 * Markers:
 *  - // @check-ignore on the line immediately before a ```ts fence skips that block.
 *  - ```ts-type fences (type signature fragments) are never checked.
 *
 * The extraction and reporting live in `_typecheck-blocks.mjs`, shared with the
 * skills gate (#402) so the two cannot drift.
 *
 * Prerequisites: pnpm install && pnpm run dev:prepare (creates dist/ for jssdk types).
 */

import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkMarkdownFiles } from './_docs-utils.mjs'
import { requireSdkTypes } from './_require-sdk-types.mjs'
import { checkBlocks } from './_typecheck-blocks.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')

// SDK types live in dist/, produced by `pnpm run dev:prepare`. Without them the
// generated blocks fail with a cryptic TS2307 — guard with an actionable message (#109).
requireSdkTypes('docs:typecheck-blocks')

process.exit(checkBlocks({
  label: 'docs-typecheck',
  repoRoot: REPO_ROOT,
  checkDir: join(REPO_ROOT, '.docs-typecheck'),
  files: walkMarkdownFiles(join(REPO_ROOT, 'docs', 'content', 'docs'))
}))
