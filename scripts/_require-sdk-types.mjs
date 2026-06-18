// Shared guard for the contributing/docs typecheck scripts (#213).
//
// Both scripts type-check fixtures/snippets that import the workspace package
// `@bitrix24/b24jssdk`, whose types resolve to packages/jssdk/dist/esm/index.d.ts
// — a file that only exists after `pnpm run dev:prepare` builds the SDK. On a
// fresh clone dist/ is absent and bare `tsc` fails with a cryptic
// `TS2307: Cannot find module '@bitrix24/b24jssdk'` (#109). This centralises the
// marker path + the actionable message so the two scripts can't drift apart.
//
// CI always runs dev:prepare before typecheck, so this only ever helps local runs.

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Repo root, overridable via REQUIRE_SDK_TYPES_ROOT for fixture tests (mirrors
// DOCS_LINK_CHECK_ROOT / MD_INTERNAL_LINKS_ROOT). This file lives in scripts/,
// so '..' is the repo root.
const ROOT = process.env.REQUIRE_SDK_TYPES_ROOT
  ? resolve(process.env.REQUIRE_SDK_TYPES_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SDK_TYPES = resolve(ROOT, 'packages/jssdk/dist/esm/index.d.ts')

/**
 * Exit early with an actionable message if the built SDK types are missing.
 *
 * Call this at the top of a typecheck script. When the marker is present it
 * returns and the script proceeds; when it's absent it writes the
 * `run pnpm run dev:prepare` hint to stderr and exits the process with code 1.
 *
 * @param {string} label Short script tag for the message prefix, e.g.
 *   `contributing:typecheck` or `docs:typecheck-blocks`.
 * @returns {void}
 */
export function requireSdkTypes(label) {
  if (existsSync(SDK_TYPES)) return
  process.stderr.write(
    `\n[${label}] @bitrix24/b24jssdk types not found`
    + ' (packages/jssdk/dist/esm/index.d.ts).\n'
    + 'Run  pnpm run dev:prepare  first to build the SDK types, then re-run.\n\n'
  )
  process.exit(1)
}
