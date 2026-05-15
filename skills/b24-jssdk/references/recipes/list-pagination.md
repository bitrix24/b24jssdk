# List pagination

Two action types — pick by dataset size. The legacy `$b24.callListMethod` / `$b24.fetchListMethod` are deprecated; new code uses the action managers.

## Decision matrix

| Dataset | Use | Returns |
|---|---|---|
| Small (< 1000 known) | `b24.actions.v{2,3}.callList.make` | `Promise<Result<T[]>>` — full array in memory |
| Large / unknown | `b24.actions.v{2,3}.fetchList.make` | `AsyncGenerator<T[]>` — iterate with `for await` |
| Custom paging, dynamic stop, manual throttling (v2 only) | `b24.actions.v2.call.make` + `AjaxResult.isMore()` / `getNext()` | manual `AjaxResult` chain |

> **Manual paging is v2-only.** `AjaxResult.isMore()` / `getNext()` / `getTotal()` rely on the v2 `next` / `total` envelope fields and are `@deprecated`. v3 returns no `next` cursor — in v3 you must use `callList.make` / `fetchList.make`. For element counts in v3 use the `aggregate` action.

## Required options

Both `callList.make` and `fetchList.make` use **cursor-based pagination** by ordering on a unique id field. That has consequences:

- **`customKeyForResult` is required in v3** (no default). For `crm.item.list` it's `'items'`. For most v3 list methods it's `'items'`. The action uses this to extract the array from the REST response payload.
- **`customKeyForResult` is optional in v2** (defaults to `null` — the result array is the response root). Pass it explicitly when v2 wraps results under a key.
- **`idKey` defaults to `'id'` in v3 and `'ID'` in v2.** Match the casing your method actually returns.
- **`order` is ignored** if you pass it — the cursor must order by `idKey`. The action logs a warning. Use `filter` to narrow.

## A) Small datasets — `callList.make`

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
  idKey: 'id',                // crm.item.list uses lowercase 'id'
  customKeyForResult: 'items',
  requestId: 'companies-list'
})

if (!response.isSuccess) {
  throw new Error(response.getErrorMessages().join('; '))
}

const items: Company[] = response.getData() ?? []
```

For a v3 method (e.g. `main.eventlog.list`):

```ts
interface LogItem { id: number, userId: number }

const response = await $b24.actions.v3.callList.make<LogItem>({
  method: 'main.eventlog.list',
  params: {
    filter: [
      ['timestampX', '>=', Text.toB24Format(sixMonthAgo)]
    ],
    select: ['id', 'userId']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'eventlog-list',
  limit: 60                   // v3 lets you tune page size; default 50, max 1000
})
```

## B) Large datasets — `fetchList.make` (preferred)

Streams chunks via async iterator — constant memory regardless of total size.

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

`fetchList.make` is **not async itself** — it returns the generator synchronously. Iteration drives the calls. Errors throw an `SdkError` with code `JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V{2,3}` inside the `for await` loop.

## C) Manual paging — `call.make` + `getNext()` (v2 only, deprecated)

Use **only on v2 methods** when you need pauses, dynamic stop conditions, or custom backoff between pages. `AjaxResult.isMore()` / `getNext()` / `getTotal()` are `@deprecated` and slated for removal in v2.0.0 — there's no v3 equivalent (v3 has no `next` envelope; use `fetchList.make` instead).

```ts
import { EnumCrmEntityTypeId, AjaxResult } from '@bitrix24/b24jssdk'

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

  // your throttling / dynamic stop checks here
  all.push(...next.getData().result.items)
  page = next as typeof page
}
```

Reach for this only when you genuinely need page-by-page control over a v2 method — otherwise B is simpler, works for both versions, and respects the limiter automatically.

## Pitfalls

- **Missing `customKeyForResult` in v3** — TypeScript catches it (it's required), but runtime users sometimes shape-cast around the type. Always pass it.
- **Wrong `idKey` casing** — v2 default is `'ID'`, v3 default is `'id'`. For `crm.item.list` (a v2 method that uses lowercase fields) explicitly pass `idKey: 'id'`.
- **Passing `order`** — silently ignored with a warning. Cursor pagination requires ordering by `idKey`.
- **Iterating `fetchList.make` with `for ... of`** — it's async; use `for await ... of`.
- **Using `callList.make` for 100 000+ rows** — that's a heap explosion. Switch to `fetchList.make`.

See [batch-calls](batch-calls.md) for `batchByChunk.make` (mutating bulk arrays) and [rate-limiting](../guidelines/rate-limiting.md) for throttle tuning on long fetches.
