# Conventions

Coding patterns specific to `@bitrix24/b24jssdk`.

## Imports

Always use named imports from the package root:

```ts
import {
  initializeB24Frame,
  B24Frame,
  B24Hook,
  B24OAuth,
  EnumCrmEntityTypeId,
  Text,
  Type,
  LoggerBrowser,
  Result,
  AjaxError,
  AjaxResult,
  type ISODate
} from '@bitrix24/b24jssdk'
```

- The package is `sideEffects: false` — direct imports keep tree-shaking working.
- There is **no default export**. Code like `import b24jssdk from '@bitrix24/b24jssdk'` is wrong.
- Prefer importing `EnumCrmEntityTypeId` and other enums from the root over hard-coding numeric ids.
- Types and runtime values share the same module specifier; use `import type` only for pure type imports.

## Initialization & lifecycle

```ts
let $b24: B24Frame

async function boot() {
  $b24 = await initializeB24Frame()
  // ... use $b24
}

function teardown() {
  $b24?.destroy()
}
```

- **Always `await`** the initializer before any `call*` method.
- **Always `destroy()`** on component/page unmount. The Pull client and message listeners hold references otherwise — you'll leak handlers and `postMessage` listeners across HMR reloads.
- `initializeB24Frame()` deduplicates concurrent calls — calling it twice in flight returns the same promise.

## `Result` and `AjaxResult` (uniform return shape)

Every REST helper returns one of these two:

- `callMethod(...)` → `Promise<AjaxResult>` (single REST call; supports paging via `isMore()` + `getNext(httpClient)`).
- `callBatch(...)` → `Promise<Result>` (aggregated batch; per-command results accessible via `getData()`).
- `callListMethod(...)` → `Promise<Result>` (auto-paged list; `getData()` returns the full array).
- `fetchListMethod(...)` → `AsyncGenerator<any[]>` (chunked stream; iterate with `for await`).
- `callBatchByChunk(...)` → `Promise<Result>` (chunks a large batch, returns aggregated result).

Common methods on `Result` / `AjaxResult`:

- `getData()` — raw REST payload (object for single calls, array for list calls).
- `isSuccess` — boolean; `false` if the call accumulated errors.
- `getErrors()` — iterable of error objects when `isHaltOnError=false`.
- `getTotal()` — total count for list calls.
- `isMore()` — `AjaxResult` only; `true` when more pages remain.
- `getNext(httpClient)` — fetch the next page; returns `AjaxResult | false`.

## Slot for a typical app

```ts
import { initializeB24Frame, type B24Frame } from '@bitrix24/b24jssdk'

let $b24: B24Frame | null = null

export async function getB24(): Promise<B24Frame> {
  if ($b24) return $b24
  $b24 = await initializeB24Frame()
  return $b24
}

export function disposeB24() {
  $b24?.destroy()
  $b24 = null
}
```

## Tools

The SDK ships utilities under named exports — don't reach for third-party libs when these cover the case:

- `Text` — Luxon-backed dates (`Text.toDateTime(iso)`), `Text.numberFormat`, `Text.getUuidRfc4122` (UUID v7).
- `Type` — runtime guards (`Type.isStringFilled`, `Type.isPlainObject`, `Type.isArray`, …).
- `Browser` — lightweight environment helpers.
- `useFormatters` — number/date formatting hooks.
- `pick`, `omit`, `getEnumValue` — object/enum helpers.

## Build-time tokens

`__SDK_VERSION__` and `__SDK_USER_AGENT__` are replaced at build time. Don't reference them in user code — they exist for unbuild substitution inside the SDK only.

## Common pitfalls

- **Calling REST before init.** Always `await initializeB24Frame()` (or construct `B24Hook`/`B24OAuth`) before the first `call*`.
- **Using `B24Hook` in the browser.** The webhook secret leaks. Use `B24Frame` (frame placements) or `B24OAuth` (local apps) on the client.
- **Forgetting `destroy()`.** Causes Pull subscriptions and `postMessage` listeners to pile up across navigations and HMR.
- **Treating `getData()` shape as fixed.** It mirrors the underlying REST response — single calls return the REST payload, list calls return an array, batches return a keyed object.
- **Mocking REST in tests.** The repo's integration tests hit a real portal on purpose. Don't mock — see `CLAUDE.md` Tests section.
