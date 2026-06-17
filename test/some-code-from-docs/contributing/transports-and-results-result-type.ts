/**
 * Canonical compile-checked example for the Result type from
 * .github/contributing/transports-and-results.md (§ Result Type).
 *
 * The guide snippet constructs `new Result(payload)` from the internal
 * `../core/result` path to show how the SDK builds one; the contributor-facing
 * truth is that callers *receive* a Result from the action surface, branch on
 * `isSuccess`, and read the payload via `getData()` (`result.getData().result`
 * in the guide). This pins the public `Result` type and both members.
 *
 * If this file stops compiling, the contributing guide is out of sync with the SDK.
 * Prerequisite: pnpm run dev:prepare (builds dist/ and its type declarations).
 */

import type { Result } from '@bitrix24/b24jssdk'

export function isOk(result: Result): boolean {
  return result.isSuccess
}

export function readData(result: Result): unknown {
  // getData() is typed `T | null | undefined` — the payload, or null/undefined.
  return result.getData()
}
