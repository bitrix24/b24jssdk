---
name: b24jssdk-rest
description: Call the Bitrix24 REST API through b24jssdk using the canonical actions.v{2,3}.*.make() surface. Covers call, batch, callList, fetchList, batchByChunk (and the v3-only native-keyset callTail/fetchTail) for both API versions, picking between v2 and v3, and the rules for the new AjaxResult shape. The legacy callMethod/callBatch/callListMethod/fetchListMethod surface is @deprecated for 3.0.0 — do not generate code against it.
---

# b24jssdk REST patterns (actions API)

Every example uses `$b24` of type `TypeB24`, so the same code runs on `B24Hook`, `B24Frame`, and `B24OAuth`. The actions surface is published per API version under `$b24.actions.v2.*` and `$b24.actions.v3.*`.

> The previous SDK surface — `callMethod`, `callBatch`, `callBatchByChunk`, `callListMethod`, `fetchListMethod` — is **`@deprecated`** and scheduled for removal in **`3.0.0`** (see `packages/jssdk/README-AI.md` "Deprecation notice"). Do not generate new code against it.
>
> The `AjaxResult` paging members — `isMore()`, `hasMore()`, `getTotal()`, `getNext()`, `fetchNext()` — are **not** in that set and are not deprecated. They are `restApi:v2`-only; see "restApi:v2 paging members" below.

## Pick the API version

The SDK exposes both `v2` and `v3` under `$b24.actions`. **The SDK no longer keeps a hardcoded v3 method allowlist** — the server is the source of truth for which methods exist on a portal (the authoritative list is the portal's own OpenAPI document, `rest.documentation.openapi`). So `$b24.actions.v3.*` will send *any* method to the v3 endpoint; if the method isn't a v3 method, the server returns a `METHODNOTFOUNDEXCEPTION` (a soft error on the `AjaxResult`, not an SDK throw).

Method families that are known to exist on v3 today (non-exhaustive): `tasks.task.*` (incl. `list`), `mail.*`, `humanresources.*`, `timeman.record.*` (read-only), `main.eventlog.*` (incl. native `tail`), `note.*`, `rest.application.*`, `rest.incomingwebhook.*`, plus infrastructure (`batch`, `scopes`, `rest.scope.list`, `rest.documentation.openapi`).

Rule of thumb:

- Default to `$b24.actions.v2.*` — it works for every classic method.
- Use `$b24.actions.v3.*` when you specifically want the v3 representation of a method (camelCase fields, the unified `{result}` envelope, native `tail`/cursor, dotted relation select). Confirm a method exists on this portal's v3 via `rest.documentation.openapi` if unsure.
- Version auto-detection (the deprecated legacy `callMethod`/`callBatch` shims) defaults to v2; v3 is opt-in only via the explicit `actions.v3.*` surface.

## Decision tree

| Goal | Use |
| --- | --- |
| Single REST call | `actions.v{2,3}.call.make` |
| 2–50 related calls in one HTTP round-trip | `actions.v{2,3}.batch.make` |
| Many independent calls (>50) | `actions.v{2,3}.batchByChunk.make` |
| Read a small list (<1000 items) and process in memory | `actions.v{2,3}.callList.make` |
| Read a large list with low memory footprint | `actions.v{2,3}.fetchList.make` (async iterator) |
| Read a v3 method that exposes a native `tail` (keyset) action — e.g. `main.eventlog.tail` | `actions.v3.callTail.make` / `actions.v3.fetchTail.make` (v3 only) |
| Aggregate (`sum`/`avg`/`min`/`max`/`count`/`countDistinct`) on a v3 method that exposes an `*.aggregate` action | `actions.v3.aggregate.make` (v3 only, **`@experimental`** — unverified live; fall back to `callList` + reduce if the endpoint isn't available) |

There is no manual-pagination path any more — the list helpers page for you. Two mechanisms exist, and they are not interchangeable:

- **`callList` / `fetchList`** *emulate* a cursor on top of the `list` action by injecting a `[idField, '>', n]` condition into `filter` and forcing `order`. Works for any `*.list` method (v2 and v3).
- **`callTail` / `fetchTail`** (v3 only) drive the server's *native* `tail` action via its `cursor: { field, value, order, limit }` parameter. Use these when a method publishes a `*.tail` endpoint. The cursor field must **not** appear in `filter` (the server rejects it), is auto-added to `select`, and `order: 'DESC'` requires an explicit `initialValue`.

## `call.make` — single call

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

interface CrmItem { id: number; title: string; stageId: string }

const response = await $b24.actions.v2.call.make<{ item: CrmItem }>({
  method: 'crm.item.get',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    id: 42
  },
  requestId: 'deal-42'
})

if (!response.isSuccess) {
  throw new Error(response.getErrorMessages().join('; '))
}

const deal = response.getData()!.result.item
```

For a v3 method:

```ts
interface TaskItem { id: number; title: string }

const response = await $b24.actions.v3.call.make<{ task: TaskItem }>({
  method: 'tasks.task.get',
  params: { id: 1, select: ['id', 'title'] },
  requestId: 'task-1'
})
const task = response.getData()!.result.task
```

## `batch.make` — array form

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
import type { AjaxResult } from '@bitrix24/b24jssdk'

interface Contact { id: number; name: string }

const response = await $b24.actions.v2.batch.make<{ item: Contact }>({
  calls: [
    ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: 1 }],
    ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.contact, id: 2 }]
  ],
  options: {
    isHaltOnError: true,
    returnAjaxResult: true,
    requestId: 'batch-1'
  }
})

if (!response.isSuccess) throw new Error(response.getErrorMessages().join('; '))

// When returnAjaxResult: true, results are an array of AjaxResult<T>
const results = response.getData()! as AjaxResult<{ item: Contact }>[]
for (const r of results) {
  if (r.isSuccess) console.log(r.getData()!.result.item)
}
```

## `batch.make` — named object form

```ts
import type { AjaxResult } from '@bitrix24/b24jssdk'
interface Contact { id: number; name: string }
interface Deal { id: number; title: string }

const response = await $b24.actions.v2.batch.make<{ item: Contact } | { item: Deal }>({
  calls: {
    Contact: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
    Deal: ['crm.item.get', { entityTypeId: 2, id: 2 }]
  },
  options: { isHaltOnError: true, returnAjaxResult: true, requestId: 'batch-named' }
})

const data = response.getData()! as Record<string, AjaxResult<{ item: Contact } | { item: Deal }>>
console.log(data.Contact.getData()!.result.item)
console.log(data.Deal.getData()!.result.item)
```

## `batch.make` — partial errors (v2 only)

Set `isHaltOnError: false` to collect per-command failures. **v3 batch is all-or-nothing** — partial errors are not surfaced. If any command in a v3 batch fails, the whole batch fails (see `README-AI.md` "Limitations").

To feed one v3 command's output into a later one, give it an `as` alias and reference it with the `BatchRefV3` markers (`import { BatchRefV3 } from '@bitrix24/b24jssdk'`): `BatchRefV3.ref('alias.item.id')` (single value) or `BatchRefV3.refArray('alias.id')` (a field collected across the alias's `items[]`). The server does the substitution.

```ts
import type { AjaxResult } from '@bitrix24/b24jssdk'
const response = await $b24.actions.v2.batch.make<{ item: Contact }>({
  calls: arrayOfCalls,
  options: { isHaltOnError: false, returnAjaxResult: true }
})

const items = response.getData()! as AjaxResult<{ item: Contact }>[]
const successes = items.filter((r) => r.isSuccess)
const failures = items.filter((r) => !r.isSuccess).map((r) => r.getErrorMessages().join('; '))
```

For **object / named-command** calls (`calls: { name: { method, params } }`), the outer `Result` keys each failure by the command name — use `response.getErrorsByKey()` / `getErrorMessagesByKey()` to get a `{ name: error }` map instead of iterating per-item results.

## `batchByChunk.make` — large batches

Chunk size is 50 per Bitrix24 batch limit. The action splits and re-aggregates:

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'

const calls: BatchCommandsArrayUniversal = ids.map((id) =>
  ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.deal, id }] as const
)

const response = await $b24.actions.v2.batchByChunk.make<{ item: CrmItem }>({
  calls,
  options: { isHaltOnError: false, requestId: 'bulk-1' }
})

if (!response.isSuccess) throw new Error(response.getErrorMessages().join('; '))

const data = response.getData()! // Flat array of { item: CrmItem }
const items = data.map((row) => row.item)
```

## `callList.make` — small lists in memory

Loads up to 1000 items into a single array. Internally pages with a keyset cursor on `cursorIdKey` (which defaults to `idKey`).

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
import { Text } from '@bitrix24/b24jssdk'

interface CrmItem { id: number; title: string }

const sixMonthsAgo = new Date()
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

const response = await $b24.actions.v2.callList.make<CrmItem>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    filter: {
      '=%title': 'A%',
      '>=createdTime': Text.toB24Format(sixMonthsAgo)
    },
    select: ['id', 'title']
  },
  idKey: 'id',                    // 'id' for crm.item.*; default is 'ID' for classic methods
  customKeyForResult: 'items',    // 'items' for crm.item.*; omit for classic methods
  requestId: 'companies-1'
})

if (!response.isSuccess) throw new Error(response.getErrorMessages().join('; '))

const items = response.getData()! // CrmItem[]
```

> **`order` is ignored** by `callList.make`. The action forces `order: { [cursorIdKey]: 'ASC' }` for cursor stability and **logs a warning** when you pass an `order` (see the `order` warning in `actions/v2/call-list.ts`). Use `filter` to narrow results.

## `fetchList.make` — large lists, streaming

Async iterator that yields chunks. Same shape as `callList.make` plus an optional `limit` for v3.

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'
const generator = $b24.actions.v2.fetchList.make<CrmItem>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    filter: { '!stageId': ['WON', 'LOSE'] },
    select: ['id', 'title', 'stageId']
  },
  idKey: 'id',
  customKeyForResult: 'items'
})

for await (const chunk of generator) {
  for (const deal of chunk) await processDeal(deal)
}
```

For v3:

```ts
import { Text } from '@bitrix24/b24jssdk'
const generator = $b24.actions.v3.fetchList.make<EventLogItem>({
  method: 'main.eventlog.list',
  params: {
    filter: [['timestampX', '>=', Text.toB24Format(sixMonthsAgo)]],
    select: ['id', 'userId']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  limit: 100
})
```

> **Note the v2 vs v3 filter difference.** v2 uses prefix-keyed objects; v3 uses arrays of `[field, op, value]` triples — for nested groups build them with the typed `FilterV3` helper (`import { FilterV3 } from '@bitrix24/b24jssdk'`). See the `b24jssdk-filtering` skill.

## `idKey`, `cursorIdKey` and `customKeyForResult` cheat sheet

`idKey` is the id field **in the response** (the cursor reads its value); `cursorIdKey` is the field **in the request** used for `order` and the `>` page filter, and it defaults to `idKey`. They differ only when a method sorts/filters by one name but returns another — most notably `tasks.task.list` **on v2** (request `ID`, response `id`). On the **v3** endpoint `tasks.task.list` is all-lowercase (`id` for both request and response, rows under `result.items`), so no `cursorIdKey` override is needed.

| Method | `idKey` (response) | `cursorIdKey` (request) | `customKeyForResult` |
| --- | --- | --- | --- |
| `crm.item.list` (v2) | `'id'` | — (= `idKey`) | `'items'` |
| `crm.deal.list`, `crm.contact.list`, … (classic v2) | `'ID'` (default) | — (= `idKey`) | omit (default `result`) |
| `tasks.task.list` (v2) | `'id'` | `'ID'` | `'tasks'` |
| `tasks.task.list` (v3) | `'id'` | — (= `idKey`) | `'items'` |
| `disk.folder.getchildren` | `'ID'` (default) | — (= `idKey`) | omit |
| `main.eventlog.list` (v3) | `'id'` | — (= `idKey`) | `'items'` |

Wrong `customKeyForResult` makes `getData()` return an empty array — there is no error. If you're getting `[]` and expect data, this is the first thing to check.

## AjaxResult — new shape

```ts
const res = await $b24.actions.v2.call.make<{ item: CrmItem }>({
  method: 'crm.item.get',
  params: { entityTypeId: 2, id: 10 }
})

res.isSuccess               // boolean
res.getData()               // SuccessPayload<T> | undefined → { result, time } | undefined
res.getErrorMessages()      // string[] (preferred)
res.getErrors()             // IterableIterator<Error> (values only, no keys)
res.getErrorsByKey()        // Record<string, Error> (batch: keyed by command label, or numeric position for array-mode)
res.getStatus()             // HTTP status
res.getQuery()              // { method, params, requestId }
```

> `getData()` returns `undefined` when the call did not succeed — the new typing forces you to either check `isSuccess` first, or assert with `!`. Both patterns appear in the canonical SDK tests (`test/integration/js-docs/actions-v{2,3}.spec.ts`).

### What `getData()` returns, per action

Only `call.make` has a `result` property. Reading `.result` off the others gives `undefined` — no error, no warning, just a value that reads as an empty response (#425).

| Action | `getData()` | Reach a row with |
| --- | --- | --- |
| `call.make` | `{ result, time }` | `getData()!.result` |
| `batch.make` | the keyed map, or an array for the array form | `getData()!.myKey` |
| `callList.make` | a flat array | `getData()![0]` |
| `batchByChunk.make` | a flat array | `getData()![0]` |
| `fetchList.make` | *(async generator)* — yields arrays | `for await (const chunk of …)` |

With `options.returnAjaxResult: true`, each entry of a batch result is an `AjaxResult` rather than the raw payload, so you reach a row with `getData()!.myKey.getData()!.result`.

### `restApi:v2` paging members — kept, but v2-only

`isMore()` / `hasMore()` / `getTotal()` / `getNext()` / `fetchNext()` are **not** deprecated and are **not** going away in `3.0.0`. They work with the v2 envelope fields `next` / `total` directly.

```ts
import type { AjaxResult } from '@bitrix24/b24jssdk'
declare const response: AjaxResult<{ ID: string }[]>
const total: number = response.getTotal()   // restApi:v2 only
const more: boolean = response.isMore()     // restApi:v2 only
```

On a **`restApi:v3`** response both return their empty value — `0` and `false` — because v3 sends no such field. That is not "no rows matched" or "no more pages"; there is simply nothing to read. Never branch on them under v3.

`getNext(http)` / `fetchNext(http)` re-run the query at the reported `next` offset. Under `restApi:v3` they **throw** `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` rather than returning empty, because a silent `false` would be indistinguishable from "last page". For new paging code still prefer `callList.make` / `fetchList.make` — they hide the offset bookkeeping and work under both versions.

For a v3 count use `actions.v3.aggregate.make` with `select: { count: ['id'] }` on a method that exposes an `*.aggregate` action. Note that action is `@experimental` and **has not been verified against a live portal** — most modules do not expose `*.aggregate` yet. If it is unavailable, reduce a `callList` client-side.

## Null result is passthrough

A per-command `result` inside a batch can legitimately be `null` (e.g. `im.chat.get` with non-matching params — see issue #23). Type the generic as `T | null` and handle the null branch — the SDK no longer coerces to `{}`.

```ts
import type { AjaxResult } from '@bitrix24/b24jssdk'
const response = await $b24.actions.v2.batch.make<{ result: ChatInfo | null }>({
  calls: { Chat: ['im.chat.get', { chat_id: 999999 }] },
  options: { returnAjaxResult: true }
})
const chat = (response.getData() as Record<string, AjaxResult<{ result: ChatInfo | null }>>)
  .Chat.getData()!.result.result
if (chat === null) {
  // chat not found — expected branch
}
```

## Error handling — quick template

```ts
import { AjaxError, SdkError } from '@bitrix24/b24jssdk'

async function loadDeal() {
  try {
    const res = await $b24.actions.v2.call.make<{ item: Deal }>({
      method: 'crm.item.get',
      params: { entityTypeId: 2, id: 999_999 }
    })
    if (!res.isSuccess) {
      // Soft errors (rare; usually you'll see throws)
      logger.warning('non-success', { errors: res.getErrorMessages() })
      return
    }
    return res.getData()!.result.item
  } catch (e) {
    if (e instanceof AjaxError) {
      // Bitrix24 REST error
      logger.error('REST error', { code: e.code, status: e.status, message: e.message, requestInfo: e.requestInfo })
      // restApi:v3 only: `e.validation` names the field that failed, which
      // `message` does not. Both `field` and `message` are optional.
      for (const detail of e.validation ?? []) {
        logger.error('invalid field', { field: detail.field, message: detail.message })
      }
    } else if (e instanceof SdkError) {
      // SDK-level error (wrong API version, etc.)
      logger.error('SDK error', { code: e.code, message: e.message })
    } else {
      throw e
    }
  }
}
```

> **`requestInfo` is safe to log because `AjaxError` redacts it, not because
> the call site is careful.** Its constructor runs the request params through
> `redactSensitiveParams`, replacing `auth`, `token`, `secret`, `access_token`,
> `refresh_token`, `client_secret`, `application_token`, `password`, `sessid`,
> `key` and `signature` with `***REDACTED***`. So do not rebuild that context by hand from
> the original params — a hand-assembled `{ method, params }` inherits none of
> that and will put a live credential into the log.

For tuning retry/throw behaviour per error code see the `hardErrorCodes` / `softErrorCodes` / `retryOnNetworkError` section in the `b24jssdk-core` skill.

## Discover available v3 methods (OpenAPI)

The portal is the source of truth for which v3 methods exist — the SDK keeps no allowlist. Ask the portal with `rest.documentation.openapi`, an ordinary v3 call that returns the portal's own OpenAPI 3.0.0 document (every v3 method available *on that portal*, with each method's request fields and response shape). Useful for an agent before generating a call: enumerate real method names and field names instead of guessing.

```ts
type OpenApiDoc = {
  openapi: string
  tags: Array<{ name: string, description: string }> // one per module
  paths: Record<string, { post?: { tags?: string[], requestBody?: unknown } }> // keyed by "/method.name"
}

const res = await $b24.actions.v3.call.make<OpenApiDoc>({ method: 'rest.documentation.openapi' })
if (!res.isSuccess) {
  throw new Error(res.getErrorMessages().join('; '))
}
const doc = res.getData()?.result

// every available method name
const methods = Object.keys(doc?.paths ?? {}).map(p => p.replace(/^\//, ''))

// does a method exist on this portal's v3?
const hasNotes = Boolean(doc?.paths?.['/note.collection.list'])
```

- The document is **portal-specific** (reflects installed modules + token scopes) and **large** (100 KB+). Fetch it **once and cache it** — it's response-only and stable within a session; don't re-request per interaction.
- Each `paths['/method.name'].post.requestBody` schema lists the accepted parameters (often with an `example` of real field names) — read those instead of inventing `select` fields.
- Full guide: [Discovering v3 methods](https://github.com/bitrix24/b24jssdk/blob/main/docs/content/docs/2.working-with-the-rest-api/7.discovering-v3-methods.md).

## Anti-patterns

- ❌ `$b24.callMethod(...)`, `$b24.callBatch(...)`, etc. — `@deprecated`, removed in 3.0.0. Use the actions API.
- ❌ `res.getNext()` / `res.fetchNext()` against a **v3** client — they throw `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`. Under v2 they work and are supported; for new code prefer `callList` / `fetchList`, which work under both versions.
- ❌ Reading `res.getTotal()` or `res.isMore()` on a **v3** response — not an error, but they always answer `0` / `false` there because v3 sends no `total` / `next`. Under v2 they are correct and supported. For a v3 count use `actions.v3.aggregate.make` (`count`/`countDistinct`) on a method that exposes an `*.aggregate` action, and treat it as unverified.
- ❌ Calling `$b24.actions.v3.call.make({ method: 'crm.item.get', ... })` — `crm.*` is v2-only, so the v3 server returns a `METHODNOTFOUNDEXCEPTION` soft error (`response.isSuccess === false`); use `actions.v2.*` for CRM. (The SDK no longer pre-flight-throws here.)
- ❌ Passing `order` to `callList.make` — silently ignored with a warning. Narrow with `filter` instead.
- ❌ `customKeyForResult: 'result'` for `crm.item.list` — wrong, use `'items'`. Otherwise you'll get an empty list silently.
- ❌ `idKey: 'ID'` for `crm.item.list` — wrong, use `'id'`. The classic `crm.deal.list` is the opposite.
- ❌ `idKey: 'ID'` alone for `tasks.task.list` — the response id is lowercase `id`, so the cursor can't read it and paging silently stops after 50. Use `idKey: 'id', cursorIdKey: 'ID'`.
- ❌ `Promise.all` over `callList.make` for parallel paging — internal cursor pagination is sequential by design; you'll get duplicates or skipped rows.
- ❌ Hand-paging a v3 list method by the `nextCursor` it returns (e.g. `note.*`) — `callList` / `fetchList` page via their own `idKey` cursor and walk every page; `nextCursor` is informational and the SDK ignores it. Just use the list helpers with `idKey` + `customKeyForResult`.
- ❌ `batch.make({ calls, isHaltOnError: false })` — batch flags at the top level are **not applied**. They belong under `options: { isHaltOnError, returnAjaxResult, requestId }`. TypeScript now rejects the literal and the SDK logs a warning for callers it cannot see, but nothing recovers the intent: `returnAjaxResult` dropped this way makes `entry.isSuccess` `undefined` on a plain object, so a batch where everything succeeded reads as a batch where everything failed (#426).
- ❌ Reading `getData()!.result` off `batch.make` / `callList.make` / `batchByChunk.make` — only `call.make` returns that envelope. See the table above.
- ❌ `B24Hook` in a browser bundle — leaks the webhook secret. Use `B24Frame` there.

## Cross-reference

For v3 filter dialect / ordering / NULL handling, use the `b24jssdk-filtering` skill.
