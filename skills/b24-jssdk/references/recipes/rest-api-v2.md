# REST API v2 (`b24.actions.v2.*`)

Comprehensive reference for the v2 REST surface. Covers single calls, list retrieval (in-memory and streaming), and batched calls (≤ 50 and auto-chunked).

The v3 mirror is in [rest-api-v3](rest-api-v3.md). The two trees are independent — `b24.actions.v2` and `b24.actions.v3` route through separate HTTP clients with separate cursor schemes. You cannot mix v2-only and v3-supported methods inside a single `batch.make` call.

## When to use v2

**Most code today.** The Bitrix24 v3 endpoint only supports a small set of `tasks.task.*` / `main.eventlog.*` methods + some meta endpoints. Everything CRM (`crm.item.*`, `crm.deal.*`, `crm.contact.*`, …), IM (`im.chat.*`, `im.message.*`, …), user/profile (`user.current`, `profile`), placement, options, and most settings is **v2-only**.

When v3 doesn't have your method (you get `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`), use v2. See [rest-api-v3](rest-api-v3.md) for the current v3 method list.

## Surface

| Action | Path | Returns |
|---|---|---|
| Single call | `b24.actions.v2.call.make` | `Promise<AjaxResult<T>>` |
| Auto-paged list | `b24.actions.v2.callList.make` | `Promise<Result<T[]>>` |
| Streamed list | `b24.actions.v2.fetchList.make` | `AsyncGenerator<T[]>` |
| Batch (≤ 50) | `b24.actions.v2.batch.make` | `Promise<CallBatchResult<T>>` |
| Auto-chunked batch | `b24.actions.v2.batchByChunk.make` | `Promise<Result<T[]>>` |

## Single call — `call.make`

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

interface Company { id: number, title: string }

const response = await $b24.actions.v2.call.make<{ item: Company }>({
  method: 'crm.item.get',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    id: 123
  },
  requestId: 'company-123'
})

if (!response.isSuccess) {
  throw new Error(response.getErrorMessages().join('; '))
}
console.log(response.getData().result.item.title)
```

Options: `{ method, params?, requestId? }`. `params` are the REST method's own parameters.

## Auto-paged list — `callList.make`

Loads the entire dataset into memory. Use for known small sets (< 1000 items).

```ts
import { EnumCrmEntityTypeId, Text } from '@bitrix24/b24jssdk'

interface Company { id: number, title: string }

const sixMonthAgo = new Date()
sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6)

const response = await $b24.actions.v2.callList.make<Company>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    filter: {
      '=%title': 'A%',
      '>=createdTime': Text.toB24Format(sixMonthAgo)
    },
    select: ['id', 'title']
  },
  idKey: 'id',                  // crm.item.list returns lowercase 'id'
  customKeyForResult: 'items',
  requestId: 'companies-recent'
})

const items: Company[] = response.getData() ?? []
```

Options: `{ method, params?, idKey?, customKeyForResult?, requestId? }`.

- `idKey?` — id field used for cursor pagination. Default `'ID'`. For `crm.item.*` (lowercase fields) pass `idKey: 'id'`.
- `customKeyForResult?` — payload-array key. Default `null` (= response root is the array). Pass `'items'` for `crm.item.list`, etc.
- `order` (if provided) is **ignored** — cursor pagination orders by `idKey`. The action logs a warning. Use `filter` to narrow.
- v2 filter shape is an object: `{ '>=createdTime': '...', '=%title': 'A%' }` (operator-prefixed keys).

## Streamed list — `fetchList.make` (preferred for large datasets)

Async generator — constant memory regardless of total size.

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

interface Deal { id: number, title: string }

const generator = $b24.actions.v2.fetchList.make<Deal>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    select: ['id', 'title']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'deals-stream'
})

for await (const chunk of generator) {
  for (const row of chunk) {
    // process row
  }
}
```

Same options as `callList.make`. Errors throw `SdkError` with code `JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V2` on the `for await` iteration.

`fetchList.make` is **not async itself** — it returns the generator synchronously; iteration drives the calls.

## Batch — `batch.make`

Up to 50 commands per call. Three input shapes:

```ts
// 1) Array of tuples — homogeneous batches
await $b24.actions.v2.batch.make({
  calls: [
    ['crm.item.get', { entityTypeId: 3, id: 1 }],
    ['crm.item.get', { entityTypeId: 3, id: 2 }]
  ],
  options: { isHaltOnError: true, requestId: 'company-pair' }
})

// 2) Array of objects — same data, more readable
await $b24.actions.v2.batch.make({
  calls: [
    { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
    { method: 'crm.item.get', params: { entityTypeId: 3, id: 2 } }
  ]
})

// 3) Named object — results keyed by name
interface CompanyItem { id: number, title: string }
interface ContactItem { id: number, name: string }

const response = await $b24.actions.v2.batch.make<{ item: CompanyItem } | { item: ContactItem }>({
  calls: {
    Company: { method: 'crm.item.get', params: { entityTypeId: 3, id: 1 } },
    Contact: ['crm.item.get', { entityTypeId: 4, id: 2 }]
  },
  options: {
    isHaltOnError: true,
    returnAjaxResult: true,
    requestId: 'mixed-fetch'
  }
})

const data = response.getData() as Record<'Company' | 'Contact', AjaxResult<{ item: CompanyItem | ContactItem }>>
console.log(data.Company.getData().result.item)
console.log(data.Contact.getData().result.item)
```

`options`:

- `isHaltOnError?: boolean` — `true` (default): reject on first failing command. `false`: accumulate per-command errors on the returned `Result`.
- `returnAjaxResult?: boolean` — `false` (default): flat data values; `true`: each value is an `AjaxResult` so you can inspect individual command status / pagination.
- `requestId?: string` — for tracing.

## Auto-chunked batch — `batchByChunk.make`

For batches > 50 commands. Splits into 50-command chunks, runs them sequentially through the limiter, merges results.

```ts
import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'

const commands: BatchCommandsArrayUniversal = ids.map((id) => [
  'crm.item.update',
  { entityTypeId: EnumCrmEntityTypeId.deal, id, fields: { stageId: 'WON' } }
])

const response = await $b24.actions.v2.batchByChunk.make({
  calls: commands,
  options: {
    isHaltOnError: false,
    requestId: 'mark-deals-won'
  }
})

if (!response.isSuccess) {
  for (const [index, err] of response.errors) {
    console.warn('chunk failure', index, err)
  }
}

const okRows = response.getData() // flat T[] of successful rows
```

- **Named-object input is not supported** for `batchByChunk` — chunks can't preserve named keys. Use array shapes.
- **`returnAjaxResult` is forced to `false`** — output is flattened `T[]`.

## Choosing between actions

| Need | Use |
|---|---|
| One call, one method | `call.make` |
| All rows of one list method, known small | `callList.make` |
| All rows of one list method, large/unknown | `fetchList.make` |
| Different methods in one round-trip (≤ 50) | `batch.make` |
| Mutate / read N rows where N > 50 | `batchByChunk.make` |
| Custom paging on a v2 list method (pauses, dynamic stop) | `call.make` + `AjaxResult.getNext()` (deprecated, v2-only) |

## Manual paging via `AjaxResult.getNext()` (v2-only, deprecated)

`AjaxResult.isMore()` / `getNext()` / `getTotal()` are v2-only legacy helpers, `@deprecated` and slated for removal in v2.0.0. They rely on the v2 `next` / `total` envelope fields, which v3 doesn't return.

Use only when you genuinely need page-by-page control over a v2 method that can't be expressed through `fetchList.make`:

```ts
import { EnumCrmEntityTypeId, type AjaxResult } from '@bitrix24/b24jssdk'

interface Contact { id: number, name: string }

const all: Contact[] = []

let page: AjaxResult<{ items: Contact[] }> = await $b24.actions.v2.call.make({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.contact,
    order: { id: 'asc' },
    select: ['id', 'name'],
    start: 0
  }
})

all.push(...page.getData().result.items)

while (page.isMore()) {
  const next = await page.getNext($b24.getHttpClient())
  if (next === false) break
  all.push(...next.getData().result.items)
  page = next as typeof page
}
```

## Pitfalls

- **Wrong `idKey` casing** — default is `'ID'` (uppercase). For `crm.item.*` payloads the field is lowercase `id` — pass `idKey: 'id'` explicitly.
- **Missing `customKeyForResult`** — for methods that wrap rows under a key (e.g. `crm.item.list` → `'items'`), forgetting this makes the action return the whole response object instead of the array.
- **Passing `order`** to `callList.make` / `fetchList.make` — silently ignored with a warning. Use `filter` to narrow.
- **Using `for ... of`** instead of `for await ... of` with `fetchList.make` — it's an async generator.
- **Putting `crm.item.list` in `v3.batch.make`** — throws `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`. Use this file's `v2.batch.make` instead.

See [rate-limiting](../guidelines/rate-limiting.md) for tuning throughput on long fetches, and [error-handling](../guidelines/error-handling.md) for batch error semantics.
