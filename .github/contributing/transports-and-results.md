# Transports and Results

These are the SDK's "design tokens" — the cross-cutting types and policies that every transport-touching change has to follow. Read this before adding HTTP code paths, error types, or limiter logic.

## Files

```
packages/jssdk/src/core/
├── result.ts                            # Result<T> — uniform return type
├── sdk-error.ts                         # SdkError — invariant violations
└── http/
    ├── abstract-http.ts                 # Http base — callMethod / callBatch / …
    ├── ajax-result.ts                   # AjaxResult — Result + paging
    ├── ajax-error.ts                    # AjaxError — HTTP-level errors
    ├── v2.ts                            # REST v2 transport
    ├── v3.ts                            # REST v3 transport
    └── limiters/
        ├── rate-limiter.ts              # client-side QPS cap
        ├── operating-limiter.ts         # server "operating reset" handling
        ├── adaptive-delayer.ts          # dynamic backoff
        └── params-factory.ts            # ParamsFactory — preset bundles
```

## Result Type

`Result` is the uniform return type for every domain method. It carries data, errors, and (for paged endpoints) the next-page handle. **Never return raw axios responses.**

```ts
import { Result } from '../core/result'

async function load(): Promise<Result> {
  // build payload …
  return new Result(payload)
}
```

Callers consume it through a small, fixed surface:

```ts
const result = await b24.callMethod('user.get', { ID: 1 })

if (result.getErrors().length > 0) {
  // handle errors — see below
}

const user = result.getData()
```

`AjaxResult` extends `Result` for transport calls and adds paging:

```ts
const result = await b24.callListMethod('crm.deal.list', filter)

if (result.isMore()) {
  const next = await result.getNext(b24.http) // continues the cursor
}
```

- Pass the http client to `getNext()` — it preserves the same limiter stack.
- Do **not** loop with raw `start` parameters; use `isMore()` + `getNext()`.

## Error Types

Two error classes, two purposes:

| Class | Purpose | How it surfaces |
|-------|---------|-----------------|
| `SdkError` | SDK-level invariant violations (bad arguments, illegal state, missing config) | Thrown from public methods |
| `AjaxError` | HTTP / REST API errors (4xx, 5xx, malformed payloads) | Returned via `Result.getErrors()` |

```ts
// SdkError — throw on guard failures inside the SDK
if (!url) {
  throw new SdkError('B24Hook.fromWebhookUrl: url is required')
}

// AjaxError — never throw it manually; the transport layer constructs it
const result = await http.callMethod('crm.lead.add', payload)
const [err] = result.getErrors()
if (err instanceof AjaxError) {
  // err.getCode(), err.getStatus(), err.getDescription()
}
```

Rules:

- Public methods may throw `SdkError`. They must not throw bare `Error` or strings.
- Public methods must never throw `AjaxError` — the transport surfaces it through `Result`.
- A new error class belongs in `src/core/` next to `SdkError`. Don't fork the type into other directories.
- Adding a new error code: document it in the relevant docs page under "Error Handling" or "Limitations" so callers can recognise it.

## HTTP Transports

Two transports, one shared base. Both are owned by `AbstractB24` and exposed via `b24.http`.

| Transport | File | Endpoint shape |
|-----------|------|----------------|
| v2 | `packages/jssdk/src/core/http/v2.ts` | `https://<portal>/rest/<method>.json` (legacy, deprecation in progress) |
| v3 | `packages/jssdk/src/core/http/v3.ts` | newer routes (rollout in progress) |

When a method is available on **both** v2 and v3, the SDK logs a warning encouraging migration to v3. Do not silence this warning.

Choosing a transport when adding actions:

- If the REST method exists on v3, prefer v3.
- If the action is v2-only, place it under `src/core/actions/v2/`.
- v3-only goes under `src/core/actions/v3/`.
- Files mirror the action name (`call.ts`, `batch.ts`, `call-list.ts`, `fetch-list.ts`).

The base `Http` class owns retries, batching, and limiter integration — extend it rather than duplicating those concerns inside actions.

### Batch Semantics

The two batch transports differ in how they surface per-command failures. Authors of new batch-aware actions must respect this:

| Transport | Failure model | Per-command result |
|-----------|---------------|--------------------|
| v2 batch (`packages/jssdk/src/core/interaction/batch/processing/v2/abstract-processing.ts`) | Per-command — successful entries return data, failed entries surface their own error in `AjaxResult.getErrors()` | Each entry is an `AjaxResult` |
| v3 batch (`packages/jssdk/src/core/interaction/batch/processing/v3/abstract-processing.ts`) | **All-or-nothing** — if any command fails, the whole batch fails. `getData()` returns an empty map; the top-level `response.getErrorMessages()` contains the error(s) | Each entry is an `AjaxResult` (only on full success) |

Two more batch contracts shared by both versions:

- **`null` is a legitimate `result` value.** When a REST method legitimately returns no data, the per-command `result` is forwarded as-is (including `null`). Type the generic as `T | null` for nullable methods. Do not coerce `null` to `{}` — that breaks nullable type guards on the caller side.
- **Per-command `time` is the batch-level time**, not per-command. The rate-limiter does not attribute the batch duration to individual methods.
- v3 specifically: a successful response missing a result entry for a command throws `JSSDK_INTERACTION_BATCH_STRATEGY_V3_EMPTY_COMMAND_RESPONSE` — this signals a malformed REST response, not a caller error.

## Limiter Stack

Every transport call passes through three layers. Skipping any of them is a bug.

```
caller
  └─> RateLimiter         # client-side QPS cap
       └─> OperatingLimiter  # honours the server "operating reset" header
            └─> AdaptiveDelayer  # dynamic backoff on transient failures
                 └─> axios
```

| Limiter | File | Responsibility |
|---------|------|----------------|
| `RateLimiter` | `src/core/http/limiters/rate-limiter.ts` | Caps requests-per-second on the client side |
| `OperatingLimiter` | `src/core/http/limiters/operating-limiter.ts` | Pauses on the server's "operating reset" signal |
| `AdaptiveDelayer` | `src/core/http/limiters/adaptive-delayer.ts` | Dynamic backoff in response to transient failures |

Rules:

- Do not call axios (or any other HTTP client) directly from outside `src/core/http/`.
- Do not bypass a limiter "for performance" — the limits exist to keep portals from blocking the integration.
- `LicenseManager` automatically swaps in enterprise-tuned restriction params; don't second-guess it.

## ParamsFactory

`ParamsFactory` (in `src/core/http/limiters/params-factory.ts`) bundles limiter parameters into named presets. Pick a preset; don't construct ad-hoc params at call sites.

| Preset | When to use | Notable settings |
|--------|-------------|------------------|
| `getDefault()` | `B24Frame`, `B24Hook`, `B24OAuth` unless overridden | `burstLimit: 50`, `drainRate: 2`, `maxRetries: 3`, `retryOnNetworkError: true` |
| `getEnterprise()` | Enterprise plans (auto-selected via `LicenseManager`) | `burstLimit: 250`, `drainRate: 5` |
| `getBatchProcessing()` | Bulk imports / migrations | Lower QPS, larger backoff, `maxRetries: 5`, `heavyPercent: 50` |
| `getRealtime()` | UI flows where stale data is worse than a thrown error | `adaptiveConfig.enabled: false`, `maxRetries: 1` (still inherits `retryOnNetworkError: true` from default — opt out explicitly if you need fast-fail on transport errors, see below) |
| `fromTariffPlan(plan)` | When `LicenseManager` provides a portal plan string | Maps `enterprise` → `getEnterprise()`, others → `getDefault()` |

When introducing a new tuning profile, add it as a `ParamsFactory.getX()` static.

### `RestrictionParams` Knobs

Beyond the preset, `RestrictionParams` exposes per-call switches that callers can layer on top of any preset (`{ ...ParamsFactory.getDefault(), <overrides> }`). When you add a new option, document it in [docs/content/docs/2.working-with-the-rest-api/77.limiters.md](../../docs/content/docs/2.working-with-the-rest-api/77.limiters.md) — that page is the canonical reference.

| Field | Purpose |
|-------|---------|
| `maxRetries`, `retryDelay` | Retry budget for soft errors |
| `retryOnNetworkError` | Default `true`. Set `false` for **non-idempotent** calls (any `*.add`, file uploads, document generation) — a client-side timeout may have succeeded server-side, so retrying creates duplicates. With `false` the SDK throws `NETWORK_ERROR` / `REQUEST_TIMEOUT` immediately. For long-running heavy ops also raise the axios timeout via `$b24.getHttpClient(ApiVersion.vX).ajaxClient.defaults.timeout`. |
| `hardErrorCodes` | **Add** custom REST error codes that must be thrown immediately, no retry. Merged with the SDK's built-in hard list — additive only, you cannot remove built-ins (auth / fatal codes are always hard). Use for app-specific or custom REST methods whose codes the SDK doesn't recognise (otherwise unknown codes are treated as transient and retried). |
| `softErrorCodes` | **Add** custom codes that should surface inside `AjaxResult` as a soft error instead of being thrown. Use when your code branches on a specific REST error as part of normal flow (e.g. validation errors from a custom v3 endpoint). |

When adding a new field to `RestrictionParams`:

1. Default to **preserve historical behaviour** — opt-in for risk, opt-out for safety. The realtime preset history is the cautionary tale: a one-line "fast-fail by default" change silently flipped the thrown error code from `JSSDK_CALL_ALL_ATTEMPTS_EXHAUSTED` to `REQUEST_TIMEOUT` for every existing realtime caller. The change was reverted in PR review (commit `a21eab7`); the lesson is to keep new flags opt-in even when the new behaviour is "obviously better."
2. Wire the field through `RestrictionManager` (`packages/jssdk/src/core/http/limiters/manager.ts`) — that's where hard/soft lists are merged with built-ins.
3. Add an integration spec under `test/integration/core/limiters-*.spec.ts`. Pin retry counts to **exact** values, not `>=` thresholds — soft assertions silently pass through future regressions in loop bounds.

## Logger Discipline

Every transport / limiter accepts a `LoggerBrowser` and defaults to `LoggerFactory.null()`.

- Use `logger.warn(...)` for things callers should know but that don't break flow (deprecated method, unexpected payload shape).
- Use `logger.error(...)` only for unrecoverable transport-side failures.
- Do not add `console.log` calls — they cannot be silenced by callers.
- New warnings or errors must be mentioned in the relevant docs page so users can recognise them.

## Adding a New Transport Action

1. Pick the version directory (`src/core/actions/v2/` or `v3/`) that matches the REST method.
2. Create a `kebab-case.ts` file. One primary export.
3. Accept the `Http` instance (do not instantiate axios). Reuse the existing limiter stack.
4. Return a `Result` or `AjaxResult` — never a raw response.
5. Surface HTTP errors via `Result.getErrors()`. Throw `SdkError` only for argument validation.
6. Re-export from `packages/jssdk/src/index.ts` if it is part of the public API.
7. Add an integration test under `test/integration/` that hits a real portal (no response mocks).
8. Add or update the docs page that describes the action.

## Quick Reference

| Task | Use |
|------|-----|
| Return data from a domain method | `Result` |
| Return data from a transport call | `AjaxResult` |
| Iterate over a paged list | `result.isMore()` + `result.getNext(http)` |
| Reject bad arguments | `throw new SdkError(...)` |
| Inspect HTTP failures | `result.getErrors()` → `AjaxError` instances |
| Issue an HTTP call | `b24.callMethod` / `callBatch` / `callListMethod` / `fetchListMethod` / `callBatchByChunk` |
| Tune limiter behaviour | `ParamsFactory.getX()` preset |
| Get the SDK version at runtime | `__SDK_VERSION__` build token |
