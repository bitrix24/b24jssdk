---
name: b24jssdk-rest
description: Call the Bitrix24 REST API through b24jssdk using the canonical actions.v{2,3}.*.make() surface. Covers call, batch, callList, fetchList, batchByChunk for both API versions, picking between v2 and v3, and the rules for the new AjaxResult shape. The legacy callMethod/callBatch/callListMethod/fetchListMethod surface is @deprecated for 2.0.0 — do not generate code against it.
---

# b24jssdk REST patterns (actions API)

Every example uses `$b24` of type `TypeB24`, so the same code runs on `B24Hook`, `B24Frame`, and `B24OAuth`. The actions surface is published per API version under `$b24.actions.v2.*` and `$b24.actions.v3.*`.

> The previous SDK surface — `callMethod`, `callBatch`, `callBatchByChunk`, `callListMethod`, `fetchListMethod`, plus `AjaxResult.isMore() / getNext() / getTotal()` — is **`@deprecated`** and scheduled for removal in **`2.0.0`** (see `packages/jssdk/README-AI.md` "Deprecation notice"). Do not generate new code against it.

## Pick the API version

The SDK exposes both `v2` and `v3` under `$b24.actions`. **v3 only works for a small whitelist of methods** (see `packages/jssdk/src/core/version-manager.ts:21-44`):

| v3-supported methods | All other Bitrix24 methods |
|---|---|
| `tasks.task.{add,get,update,delete,chat.message.send,access.get,file.attach}` | use **v2** |
| `main.eventlog.{list,get,tail}` | |
| `batch`, `scopes`, `rest.scope.list`, `rest.documentation.openapi`, `documentation` | |

Rule of thumb:
- Default to `$b24.actions.v2.*`.
- Switch to `$b24.actions.v3.*` only when the method is in the whitelist above. The SDK logs a warning (`JSSDK_CORE_METHOD_AVAILABLE_IN_API_V3`) when you call a v3-eligible method via v2.

Calling a non-v3 method via `$b24.actions.v3.*` throws `SdkError` with code `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`.

## Decision tree

| Goal | Use |
|---|---|
| Single REST call | `actions.v{2,3}.call.make` |
| 2–50 related calls in one HTTP round-trip | `actions.v{2,3}.batch.make` |
| Many independent calls (>50) | `actions.v{2,3}.batchByChunk.make` |
| Read a small list (<1000 items) and process in memory | `actions.v{2,3}.callList.make` |
| Read a large list with low memory footprint | `actions.v{2,3}.fetchList.make` (async iterator) |

There is no manual-pagination path any more — both `callList` and `fetchList` handle the keyset cursor internally.

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

```ts
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

Loads up to 1000 items into a single array. Internally pages with keyset cursor on `idKey`.

```ts
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

> **`order` is ignored** by `callList.make`. The action forces `order: { [idKey]: 'ASC' }` for cursor stability and **logs a warning** when you pass an `order` (see `actions/v2/call-list.ts:77-79`). Use `filter` to narrow results.

## `fetchList.make` — large lists, streaming

Async iterator that yields chunks. Same shape as `callList.make` plus an optional `limit` for v3.

```ts
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
const generator = $b24.actions.v3.fetchList.make<TaskItem>({
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

> **Note the v2 vs v3 filter difference.** v2 uses prefix-keyed objects; v3 uses arrays of `[field, op, value]` triples. See the `b24jssdk-filtering` skill.

## `idKey` and `customKeyForResult` cheat sheet

| Method | `idKey` | `customKeyForResult` |
|---|---|---|
| `crm.item.list` (v2) | `'id'` | `'items'` |
| `crm.deal.list`, `crm.contact.list`, … (classic v2) | `'ID'` (default) | omit (default `result`) |
| `tasks.task.list` (v2) | `'ID'` (default) | `'tasks'` |
| `disk.folder.getchildren` | `'ID'` (default) | omit |
| `main.eventlog.list` (v3) | `'id'` | `'items'` |

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
res.getErrorsByKey()        // Record<string, Error> (keyed by request label; batch)
res.getStatus()             // HTTP status
res.getQuery()              // { method, params, requestId }
```

> `getData()` returns `undefined` when the call did not succeed — the new typing forces you to either check `isSuccess` first, or assert with `!`. Both patterns appear in the canonical SDK tests (`test/integration/js-docs/actions-v{2,3}.spec.ts`).

Removed from the public surface for `2.0.0`:
- `isMore()`, `hasMore()` — was tied to v2 envelope `next`
- `getTotal()` — was tied to v2 envelope `total`. For v3 use `actions.v3.aggregate.make` with `count` / `countDistinct`.
- `getNext()`, `fetchNext()` — replaced by `callList.make` / `fetchList.make`

## Null result is passthrough

A per-command `result` inside a batch can legitimately be `null` (e.g. `im.chat.get` with non-matching params — see issue #23). Type the generic as `T | null` and handle the null branch — the SDK no longer coerces to `{}`.

```ts
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

try {
  const res = await $b24.actions.v2.call.make({
    method: 'crm.item.get',
    params: { entityTypeId: 2, id: 999_999 }
  })
  if (!res.isSuccess) {
    // Soft errors (rare; usually you'll see throws)
    logger.warn('non-success', res.getErrorMessages())
    return
  }
  return res.getData()!.result.item
} catch (e) {
  if (e instanceof AjaxError) {
    // Bitrix24 REST error
    logger.error('REST error', { code: e.code, status: e.status, message: e.message, requestInfo: e.requestInfo })
  } else if (e instanceof SdkError) {
    // SDK-level error (wrong API version, etc.)
    logger.error('SDK error', { code: e.code, message: e.message })
  } else {
    throw e
  }
}
```

For tuning retry/throw behaviour per error code see the `hardErrorCodes` / `softErrorCodes` / `retryOnNetworkError` section in the `b24jssdk-core` skill.

## Anti-patterns

- ❌ `$b24.callMethod(...)`, `$b24.callBatch(...)`, etc. — `@deprecated`, removed in 2.0.0. Use the actions API.
- ❌ `res.getTotal()` / `res.isMore()` / `res.getNext()` — `@deprecated`, throw on v3. Use `callList` / `fetchList` for paging, `aggregate` (v3) for counts.
- ❌ Calling `$b24.actions.v3.call.make({ method: 'crm.item.get', ... })` — throws because `crm.item.get` is not in the v3 whitelist (yet).
- ❌ Passing `order` to `callList.make` — silently ignored with a warning. Narrow with `filter` instead.
- ❌ `customKeyForResult: 'result'` for `crm.item.list` — wrong, use `'items'`. Otherwise you'll get an empty list silently.
- ❌ `idKey: 'ID'` for `crm.item.list` — wrong, use `'id'`. The classic `crm.deal.list` is the opposite.
- ❌ `Promise.all` over `callList.make` for parallel paging — internal cursor pagination is sequential by design; you'll get duplicates or skipped rows.
- ❌ `B24Hook` in a browser bundle — leaks the webhook secret. Use `B24Frame` there.

## Cross-reference

For v3 filter dialect / ordering / NULL handling, use the `b24jssdk-filtering` skill.
