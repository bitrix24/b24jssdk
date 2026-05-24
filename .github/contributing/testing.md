# Testing

Tests use Vitest and run against a **real Bitrix24 portal**. The suite validates REST API contracts — a passing mocked test would defeat its purpose. **Never mock REST responses** (with one narrow exception, see [No-mock policy](#what-tests-do-not-do)).

## Vitest Projects

Defined in [vitest.config.ts](../../vitest.config.ts):

| Project | Location | Timeouts | Mode |
|---------|----------|----------|------|
| `jsSdk:integration` | `test/integration/**/*.spec.ts` | 30s test / 30s hook | parallel |
| `jsSdk:underLoad` | `test/under-load/**.spec.ts` | 40 min test / 40 min hook | sequential, no file parallelism |

Both projects load `.env.test` (gitignored) via `dotenv`.

## Environment Setup

1. Copy the example:

   ```bash
   cp .env.test-example .env.test
   ```

2. Set `B24_HOOK` to a real webhook URL:

   ```
   B24_HOOK=https://your-domain.bitrix24.com/rest/YOUR_USER_ID/YOUR_WEBHOOK_SECRET/
   ```

   **Never commit `.env.test` to version control.** It holds a real webhook secret. The file is listed in `.gitignore` — keep it that way and never modify the ignore rule.

3. `setupB24Client()` in [test/0_setup/setup-integration-jssdk.ts](../../test/0_setup/setup-integration-jssdk.ts) throws if `B24_HOOK` is missing — that is the intended fast-fail.

### Webhook scopes

The webhook must have at minimum the `crm`, `tasks`, `user`, `im`, and `main` scopes. The `im` scope is required by the issue-23 regression spec (`im.chat.get` inside a batch); `main` is **not exposed in the standard webhook scope picker** in the Bitrix24 UI and must be added manually — it is required by the v3 batch-ref spec that calls `main.eventlog.list`.

### Limiter preset

The integration test client uses `ParamsFactory.getDefault()`. The under-load setup ([test/0_setup/setup-under-load-jssdk.ts](../../test/0_setup/setup-under-load-jssdk.ts)) uses `ParamsFactory.getBatchProcessing()` — when authoring a new under-load test, do not switch back to `getDefault()` or the load profile will be wrong. To use any other preset locally, pass `restrictionParams` explicitly.

## File Location

| Suite | Location |
|-------|----------|
| Integration | `test/integration/<area>/*.spec.ts` (e.g. `core/actions-v3-batch.spec.ts`) |
| Integration — unit exception | `test/integration/<area>/*.unit.spec.ts` (e.g. `core/http-logger-redaction.unit.spec.ts`) |
| Under-load | `test/under-load/load-testing-<scenario>.spec.ts` |
| Snippets mirrored from docs | `test/some-code-from-docs/` (manual reference, not auto-run by Vitest) |
| UMD browser smoke | `test/umd/browser.html` (manual) |
| Setup helpers | `test/0_setup/` |

Integration test names follow `<area>-<flavor>.spec.ts`. The `core/` group exercises the transport layer (`actions-v2-call`, `actions-v3-batch`, `deprecated-call`, …); the `frame/`, `js-docs/`, `tools/` groups exercise their respective surfaces.

## Basic Integration Test Structure

```ts
import { describe, it, expect } from 'vitest'
import { setupB24Tests } from '../../0_setup/hooks-integration-jssdk'
import { SdkError } from '../../../packages/jssdk/src/'

describe('core.actions.call @apiV2', () => {
  const { getB24Client, getMapId } = setupB24Tests()

  it('server.time @apiV2 isSuccess', async () => {
    const b24 = getB24Client()

    const requestId = 'test@apiV2/server.time'
    const response = await b24.actions.v2.call.make({
      method: 'server.time',
      params: {},
      requestId
    })

    expect(response.isSuccess).toBe(true)
    expect(response.getData().result).toBeDefined()
  })
})
```

Conventions:

- **Always import from the package source** (`../../../packages/jssdk/src/`) — never from the built artefact.
- **Use the shared client** via `setupB24Tests()` rather than constructing your own `B24Hook` in each test. Reusing the global client keeps the limiter stack in a known state.
- **Tag describes with `@apiV2` / `@apiV3`** so test filters (`-t "@apiV3"`) can target a transport version.
- **Set a stable `requestId`** per call (`test@apiVx/<method>`) — it ends up in server logs and makes failures traceable.
- **Never interpolate the `B24_HOOK` URL or any credential into `requestId`, `code`, `description`, or other fields you assert on.** These values appear in Bitrix24 server logs and in failure messages; a leaked webhook secret there is a real incident.
- **Assert `isSuccess` first**, then drill into `getData()`. Use `getErrors()` to assert specific failure paths.
- **Use `AjaxResult` instance checks** when batches are expected to return `Result<AjaxResult<T>[]>`.

## Test ID Map (`getMapId`)

`setupB24Tests()` returns a `getMapId()` helper that resolves portal-specific IDs (companies, deals, …) used as fixtures. Use it instead of hard-coding IDs — it keeps tests portable across portals.

```ts
const { getB24Client, getMapId } = setupB24Tests()
const b24 = getB24Client()

const filter = { '>id': getMapId().crmCompanySuccessMin }
```

## Writing a New Integration Test

1. Pick the right group: `core/` (transports / actions), `frame/` (iframe-only flows), `js-docs/` (docs-snippet smoke), `tools/` (utility tests).
2. Mirror the file naming: `<area>-<flavor>.spec.ts`.
3. `describe()` with an `@apiV2` or `@apiV3` tag.
4. Always go through `setupB24Tests()` to get the shared client.
5. Use a unique `requestId` per call so failures are searchable in server logs.
6. Assert `Result` / `AjaxResult` shape — `isSuccess`, `getData()`, `getErrors()`. Don't poke at private internals.
7. For paged endpoints, exercise `isMore()` + `getNext(b24.getHttpClient(ApiVersion.v2))` (v2 only — v3 has no `getNext`; cover its paging via `actions.v3.callList.make()` / `fetchList.make()`).
8. For error paths, expect `SdkError` (thrown) or an `AjaxError` instance in `getErrors()`.
9. Keep individual tests under the 30s timeout — split if you need longer.

## Under-Load Tests

Files in `test/under-load/` run sequentially with a 40-minute timeout. They are designed to exhaust limiter budgets and validate adaptive backoff.

- One scenario per file (`load-testing-v3-batch-tasks-task-get.spec.ts`).
- Enable a single scenario with the matching root script (`pnpm run package-jssdk:test:run-underLoad-v3-batch`, etc. — see `package.json` for the full list).
- Don't run the whole suite during normal development — these are explicit per-scenario runs.
- Under-load tests use a different setup file: [test/0_setup/hooks-under-load-jssdk.ts](../../test/0_setup/hooks-under-load-jssdk.ts) (not `hooks-integration-jssdk.ts`). It exposes `useB24TestHooks`, `LoadTesterV2`, `LoadTesterV3`, `testConfig`, and `processTests` for scenario authoring.

## Filtering

```bash
# Watch, integration project
pnpm run package-jssdk:test

# One-shot, integration project
pnpm run package-jssdk:test:run

# By test-name substring
pnpm run package-jssdk:test-integration-core       # filter "core"
pnpm run package-jssdk:test-integration-js-docs    # filter "js-docs"

# Single test by exact name from the root
pnpm vitest run --project jsSdk:integration -t "<test name>"
```

The `-t` flag matches against the concatenated `describe`/`it` names, so tag tokens like `@apiV3` work as filters.

## Accessibility, UI, Snapshot Testing

The SDK has no UI — there are no axe / DOM / snapshot tests. If you find yourself reaching for those, the change probably belongs in a playground (`playgrounds/nuxt`, `playgrounds/cli`) or in the docs site, not in this suite.

## Snippets in Docs

`test/some-code-from-docs/` is a **manual reference** that mirrors a subset of snippets from the docs site. Vitest does not currently pick it up automatically — there is no project covering this directory in [vitest.config.ts](../../vitest.config.ts), and no CI step runs the files. When you change a snippet in `docs/content/docs/`, mirror it here, but treat the mirror as a paired artefact that humans verify, not as a compile-checked guarantee. Tracked separately by [bitrix24/b24jssdk#49](https://github.com/bitrix24/b24jssdk/issues/49).

## What Tests Validate

| Layer | Validate |
|-------|----------|
| Transport | `isSuccess`, returned shape, `requestId` round-trip |
| Paging | `isMore()`, `getNext()`, accumulated record count |
| Errors | `SdkError` thrown for invariant violations, `AjaxError` surfaced via `Result.getErrors()` |
| Limiters | Under-load suite confirms QPS caps and backoff |
| Deprecation | `deprecated-call.spec.ts` confirms the v3-availability warning fires when callers use a v2-deprecated method |

## What Tests Do **Not** Do

- They do not mock REST responses.
- They do not assert on log lines unless the test is specifically about the warning surface (e.g. deprecation warnings).
- They do not depend on portal-specific data outside what `getMapId()` exposes.

### Narrow exception: `*.unit.spec.ts`

A small number of regression specs live inside `test/integration/<area>/` but are named `*.unit.spec.ts` (`batch-null-result.unit.spec.ts`, `http-logger-redaction.unit.spec.ts`, `retry-client-error.unit.spec.ts`). They exercise pure-logic invariants — batch response parsing, log-context redaction, retry decision — that have nothing to verify against a live portal. They use `vi.spyOn(...).mockResolvedValue(...)` / `mockRejectedValue(...)` on the axios client, run without `.env.test` / `B24_HOOK`, and live in the `jsSdk:integration` project for convenience.

Use this naming when the test is about the **SDK's internal behaviour**, not about a REST request/response shape. Document the reason in a JSDoc header at the top of the file — see [`test/integration/core/http-logger-redaction.unit.spec.ts`](../../test/integration/core/http-logger-redaction.unit.spec.ts) (lines 1–19) for the reference shape. For anything that touches a real REST method's request or response shape — no mocks.

## Before Pushing

```bash
pnpm run lint:fix
pnpm run typecheck
pnpm run package-jssdk:test:run    # integration project, against a real portal
```

If you touched the limiter stack or transport layer, also run the relevant under-load scenario.

> **CI does not run Vitest.** The CI workflow (`.github/workflows/`) only runs `lint`, `typecheck`, and `build` — integration tests need `B24_HOOK` and are your **local-only** responsibility. A green CI on a PR does not mean the test suite passed; the reviewer expects you to confirm a local run in the PR description.

See also the [Before Submitting](../../AGENTS.md#before-submitting) checklist in `AGENTS.md` for the full per-PR checklist (lint, typecheck, docs sync, contributing-guide sync, commit-message format).
