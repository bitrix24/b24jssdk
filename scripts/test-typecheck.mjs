#!/usr/bin/env node

/**
 * Type-checks the whole test tree against `test/tsconfig.json`.
 *
 * A thin wrapper rather than a bare `tsc` in `package.json` for one reason: the
 * fixtures under `test/some-code-from-docs/` import the workspace package
 * `@bitrix24/b24jssdk`, whose types resolve to
 * `packages/jssdk/dist/esm/index.d.ts` — a file that only exists after
 * `pnpm run dev:prepare` builds the SDK. On a fresh clone `dist/` is absent and
 * bare `tsc` fails with a cryptic `TS2307: Cannot find module
 * '@bitrix24/b24jssdk'`. Guard for the marker first and print what to run
 * instead (#109). CI always runs `dev:prepare` before typecheck, so this only
 * ever helps local runs.
 *
 * This file was `contributing-typecheck.mjs`, which compiled
 * `test/some-code-from-docs/contributing/` alone. Since #429 widened
 * `test/tsconfig.json` to the whole tree those twelve files are in this
 * program too, under stricter settings — measured in #419, where a type error
 * injected into a fixture went red on both passes. The separate pass is gone;
 * the guard it carried is here.
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { requireSdkTypes } from './_require-sdk-types.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

requireSdkTypes('test:typecheck')

const tsc = resolve(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const result = spawnSync(
  process.execPath,
  [tsc, '--noEmit', '-p', 'test/tsconfig.json'],
  { stdio: 'inherit', cwd: ROOT }
)
process.exit(result.status ?? 1)
