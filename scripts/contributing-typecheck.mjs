#!/usr/bin/env node

/**
 * Type-checks the compile-checked contributing-guide snippets under
 * test/some-code-from-docs/contributing/. Those fixtures import from the
 * workspace package `@bitrix24/b24jssdk`, whose types resolve to
 * packages/jssdk/dist/esm/index.d.ts — a file that only exists after
 * `pnpm run dev:prepare` builds the SDK.
 *
 * On a fresh clone `dist/` is absent and bare `tsc` fails with a cryptic
 * `TS2307: Cannot find module '@bitrix24/b24jssdk'`. Guard for the marker first
 * and print what to run instead (#109). CI always runs dev:prepare before
 * typecheck, so this only ever helps local runs.
 */

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SDK_TYPES = resolve(ROOT, 'packages/jssdk/dist/esm/index.d.ts')

if (!existsSync(SDK_TYPES)) {
  process.stderr.write(
    '\n[contributing:typecheck] @bitrix24/b24jssdk types not found'
    + ' (packages/jssdk/dist/esm/index.d.ts).\n'
    + 'Run  pnpm run dev:prepare  first to build the SDK types, then re-run.\n\n'
  )
  process.exit(1)
}

const tsc = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const result = spawnSync(
  process.execPath,
  [tsc, '--noEmit', '-p', 'test/some-code-from-docs/contributing/tsconfig.json'],
  { stdio: 'inherit', cwd: ROOT }
)
process.exit(result.status ?? 1)
