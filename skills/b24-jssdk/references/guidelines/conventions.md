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
  ParamsFactory,
  type ISODate
} from '@bitrix24/b24jssdk'
```

- The package is `sideEffects: false` — direct imports keep tree-shaking working.
- There is **no default export**. `import b24jssdk from '@bitrix24/b24jssdk'` is wrong.
- Prefer importing `EnumCrmEntityTypeId` and other enums from the root over hard-coding numeric ids.
- Types and runtime values share the same module specifier; use `import type` only for pure type imports.

## Initialization & lifecycle

```ts
let $b24: B24Frame

async function boot() {
  $b24 = await initializeB24Frame()
}

function teardown() {
  $b24?.destroy()
}
```

- **Always `await`** the initializer before any call.
- **Always `destroy()`** on component/page unmount. The Pull client and message listeners hold references otherwise — you'll leak handlers and `postMessage` listeners across HMR reloads.
- `initializeB24Frame()` deduplicates concurrent calls — calling it twice in flight returns the same promise.

## REST surface — `b24.actions.*` and `b24.tools.*`

Every concrete entry point (`B24Frame`, `B24Hook`, `B24OAuth`) exposes two manager namespaces from `AbstractB24`:

- **`b24.actions.v2.*`** — REST API v2 (mature). Covers most current methods: `crm.*`, `im.*`, `user.*`, `profile`, placement, options, settings, etc.
- **`b24.actions.v3.*`** — REST API v3 (growing surface). Currently supports only `tasks.task.*`, `main.eventlog.*`, and meta endpoints (`batch`, `scopes`, `documentation`). Will expand over time.
- **`b24.tools.*`** — utility checks (`healthCheck`, `ping`).

**Pick by method, not by preference.** v2 and v3 are mirror trees, not old-vs-new. Default to v2; switch a specific call to v3 only when its method is on the v3 list. Calling a v2-only method via `v3.call.make` throws `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`, and a `v3.batch.make` containing any v2-only method throws the same error. See [rest-api-v3 → When to use](../recipes/rest-api-v3.md#when-to-use-v3--and-when-not-to) for the current v3 method list.

Each action is a class with a single `make(options)` method that returns the appropriate result type:

| Action | v2 path | v3 path | Returns |
|---|---|---|---|
| Single call | `b24.actions.v2.call.make` | `b24.actions.v3.call.make` | `Promise<AjaxResult<T>>` |
| Auto-paged list (in memory) | `b24.actions.v2.callList.make` | `b24.actions.v3.callList.make` | `Promise<Result<T[]>>` |
| Streamed list (async generator) | `b24.actions.v2.fetchList.make` | `b24.actions.v3.fetchList.make` | `AsyncGenerator<T[]>` |
| Batch (≤ 50 commands) | `b24.actions.v2.batch.make` | `b24.actions.v3.batch.make` | `Promise<CallBatchResult<T>>` |
| Auto-chunked batch (any size) | `b24.actions.v2.batchByChunk.make` | `b24.actions.v3.batchByChunk.make` | `Promise<Result<T[]>>` |

Full per-version reference: [rest-api-v2](../recipes/rest-api-v2.md), [rest-api-v3](../recipes/rest-api-v3.md). Decision pages: [batch-calls](../recipes/batch-calls.md), [list-pagination](../recipes/list-pagination.md).

### Minimal example

```ts
import { initializeB24Frame, EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

const $b24 = await initializeB24Frame()

interface Company { id: number, title: string }

const response = await $b24.actions.v2.call.make<{ items: Company[] }>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    select: ['id', 'title']
  },
  requestId: 'companies-1'
})

if (!response.isSuccess) {
  throw new Error(response.getErrorMessages().join('; '))
}
console.log(response.getData().result.items)
```

### Legacy `call*` methods are deprecated

`$b24.callMethod()`, `$b24.callBatch()`, `$b24.callListMethod()`, `$b24.fetchListMethod()`, `$b24.callBatchByChunk()` still exist on `AbstractB24` for backwards compatibility but log a deprecation warning and **will be removed in v2.0.0**. You'll still encounter them in older codebases — when you see those forms, mentally translate to `b24.actions.v{2,3}.*.make({ ... })`. New code should always use the action managers.

## `Result` and `AjaxResult` (uniform return shape)

- `call.make(...)` → `AjaxResult<T>` for single calls. `getData()` returns the raw REST payload (`{ result: T }` typically).
- `callList.make(...)` → `Result<T[]>` (full array in memory). `getData()` returns `T[]`.
- `fetchList.make(...)` → `AsyncGenerator<T[]>` (chunked stream). Iterate with `for await`.
- `batch.make(...)` → `CallBatchResult<T>` — shape mirrors the input: array of items for array-shaped calls, keyed object for named calls. `returnAjaxResult: true` makes each entry an `AjaxResult` so you can inspect individual command status.
- `batchByChunk.make(...)` → `Result<T[]>` (flattened success rows).

Common methods on `Result` / `AjaxResult`:

- `getData()` — raw payload or `T[]`, depending on the action.
- `isSuccess` — boolean; `false` when errors accumulated.
- `getErrorMessages()` — array of `string`; convenient for thrown messages.
- `errors` — iterable of `[index, error]` tuples for granular handling.
- `getTotal()` — total count, when the REST method returns one (`AjaxResult` only).

`AjaxResult` also carries the cursor primitives `isMore()` / `getNext(httpClient)` / `getTotal()` for manual paging — but they're **`@deprecated` and v2-only**. They rely on the v2 `next` / `total` envelope fields, which v3 doesn't return. Use `callList.make` / `fetchList.make` for both versions; for element counts in v3 use the `aggregate` action with `count` / `countDistinct`.

## Tools

The SDK ships utilities under named exports — don't reach for third-party libs when these cover the case:

- `Text` — Luxon-backed dates (`Text.toDateTime(iso)`, `Text.toB24Format(date)`), `Text.numberFormat`, `Text.getUuidRfc4122` (UUID v7).
- `Type` — runtime guards (`Type.isStringFilled`, `Type.isPlainObject`, `Type.isArray`, …).
- `Browser` — lightweight environment helpers.
- `useFormatters` — number/date formatting hooks.
- `pick`, `omit`, `getEnumValue` — object/enum helpers.

## Build-time tokens

`__SDK_VERSION__` and `__SDK_USER_AGENT__` are replaced at build time by unbuild ([packages/jssdk/build.config.ts](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/build.config.ts)). Don't reference them in user code — they exist for SDK-internal substitution.

## Common pitfalls

- **Using deprecated `call*` directly on `$b24`.** Use `$b24.actions.v{2,3}.*.make({ ... })`.
- **Calling REST before init.** Always `await initializeB24Frame()` (or construct `B24Hook`/`B24OAuth`) first.
- **Using `B24Hook` in the browser.** The webhook secret leaks. Use `B24Frame` (placements) or `B24OAuth` (local apps) on the client.
- **Forgetting `destroy()`.** Causes Pull subscriptions and `postMessage` listeners to pile up across navigations and HMR.
- **Forgetting `customKeyForResult` in v3 list/fetch actions.** It's required (no default). For `crm.item.list` it's `'items'`.
- **Passing `order` to `callList.make`/`fetchList.make`.** It's ignored (cursor pagination orders by `idKey`); a warning is logged. Use `filter` to narrow the set.
- **Mocking REST in tests.** The repo's integration tests hit a real portal on purpose. Don't mock — see `CLAUDE.md` Tests section.
