# Error handling

Two error shapes cover everything the SDK throws.

## `AjaxError` — REST/transport errors

Thrown by `callMethod`, returned inside `Result.getErrors()` for batches with `isHaltOnError=false`.

```ts
import { AjaxError } from '@bitrix24/b24jssdk'

try {
  const res = await $b24.callMethod('crm.item.get', { entityTypeId: 1, id: 10 })
  // ...
} catch (e) {
  if (e instanceof AjaxError) {
    console.error(e.code, e.description, e.status, e.requestInfo)
  } else {
    throw e
  }
}
```

Fields:

- `code` — server error code (e.g. `'ERROR_METHOD_NOT_FOUND'`, `'INVALID_TOKEN'`).
- `description` — human-readable description from the REST endpoint.
- `status` — HTTP status code.
- `requestInfo` — the request that failed (method, params, time).

## `SdkError` — SDK-internal errors

Thrown for SDK-level problems: misconfiguration, invalid initialization, OAuth refresh failure, etc. Carries a stable error code so callers can branch on it without parsing strings.

```ts
import { SdkError } from '@bitrix24/b24jssdk'

try {
  await initializeB24Frame()
} catch (e) {
  if (e instanceof SdkError) {
    // Branch on e.code; surface a user-friendly message
  }
  throw e
}
```

## Batch error aggregation

`callBatch(calls, isHaltOnError, returnAjaxResult)`:

| `isHaltOnError` | Behaviour |
|---|---|
| `true` (default) | Promise rejects on the first failing command — typical for transactional flows |
| `false` | Promise resolves; per-command errors are accumulated in the returned `Result`. Inspect with `result.isSuccess` and `result.getErrors()` |

```ts
const batch = await $b24.callBatch([
  ['crm.item.list', { entityTypeId: 1, select: ['id'] }],
  ['crm.item.list', { entityTypeId: 2, select: ['id'] }]
], false) // do not halt — collect all errors

if (!batch.isSuccess) {
  for (const err of batch.getErrors()) {
    console.warn('partial failure:', err)
  }
}

const data = batch.getData()
```

## Auth refresh in `B24Frame`

`B24Frame` automatically refreshes auth on `401`. You don't need to catch and retry. If refresh itself fails (e.g. session ended in parent), the original call's promise rejects with an `AjaxError` whose `status` reflects the failure — re-init the frame or redirect to re-auth.

## Refresh token failures in `B24OAuth`

`B24OAuth` raises a typed error when the refresh token is invalid/expired. Catch it specifically and trigger your re-auth flow (e.g. redirect the user to the OAuth consent URL).

## Retry strategy

- **Transient network errors**: rely on the built-in `RestrictionManager` and `AdaptiveDelayer` (see [rate-limiting](rate-limiting.md)) — they back off automatically on `503`/`QUERY_LIMIT_EXCEEDED`. Don't add an outer retry loop on top.
- **Application errors** (`ERROR_NOT_FOUND`, validation): don't retry — fix the input.
- **Auth errors** in frame: handled internally. In `B24OAuth`: refresh tokens; if that fails, re-auth.

## Anti-patterns

- Catching every error and swallowing it (`catch (e) { /* ignore */ }`). Always at least log via `LoggerBrowser`.
- Wrapping `callBatch` in a `try/catch` *and* using `isHaltOnError=false` — pick one strategy.
- Parsing `e.message` strings — use `e.code` (`AjaxError`) or instance checks.
