---
name: b24jssdk-rest
description: Call the Bitrix24 REST API through b24jssdk. Covers callMethod, callBatch (array & object form, halt-on-error, returnAjaxResult), callListMethod, fetchListMethod, callBatchByChunk, and the rules for picking among them. Load when generating REST calls.
---

# b24jssdk REST patterns

All four call APIs live on `AbstractB24`, so the same code works for `B24Hook`, `B24Frame`, and `B24OAuth`. The variable below is `$b24: TypeB24`.

## Decision tree

| Goal | Use |
|---|---|
| Single REST call | `callMethod` |
| 2–50 related calls in one HTTP round-trip | `callBatch` |
| Many independent calls (>50) | `callBatchByChunk` |
| Read a small list (<1000 items) and process in memory | `callListMethod` |
| Read a large list with low memory footprint | `fetchListMethod` (async iterator) |
| Need exact control over paging / backoff | `callMethod` + `isMore()` + `getNext()` |

## `callMethod` — single call

```ts
import { EnumCrmEntityTypeId, AjaxError } from '@bitrix24/b24jssdk'

const res = await $b24.callMethod('crm.item.get', {
  entityTypeId: EnumCrmEntityTypeId.deal,
  id: 42
})
const deal = res.getData().result.item
```

Optional third arg is the page cursor for `*.list` methods (default `0`).

## `callBatch` — array form

```ts
import type { Result } from '@bitrix24/b24jssdk'

const batch: Result = await $b24.callBatch(
  [
    ['crm.item.get', { entityTypeId: EnumCrmEntityTypeId.deal, id: 42 }],
    ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id', 'name'] }]
  ],
  /* isHaltOnError */ true
)

const [dealRes, contactsRes] = batch.getData()
```

Each entry is `[method, params]`. Results come back as a positional array.

## `callBatch` — object form

When you want named results:

```ts
const batch = await $b24.callBatch(
  {
    Deal: { method: 'crm.item.get', params: { entityTypeId: EnumCrmEntityTypeId.deal, id: 42 } },
    Contacts: { method: 'crm.item.list', params: { entityTypeId: EnumCrmEntityTypeId.contact } }
  },
  true
)

const data = batch.getData()
console.log(data.Deal.item.id)        // single
console.log(data.Contacts.items)      // list
```

The third parameter `returnAjaxResult` (default `false`) wraps each command result in an `AjaxResult` so you can inspect per-command status, total, and pagination.

## `callBatch` — partial errors

By default `callBatch` halts on the first error. To collect them:

```ts
const batch = await $b24.callBatch(calls, /* isHaltOnError */ false)

if (!batch.isSuccess) {
  for (const err of batch.getErrors()) {
    logger.warn('batch item failed', err.message)
  }
}
const partial = batch.getData() // present, with successful items only
```

## `callBatchByChunk` — large batches

Use when you have hundreds or thousands of independent calls. The SDK splits them into chunks of 50 and aggregates the result.

```ts
const ids = [/* ... 1500 ids ... */]
const calls = ids.map((id) => [
  'crm.item.get',
  { entityTypeId: EnumCrmEntityTypeId.deal, id }
] as const)

const result = await $b24.callBatchByChunk(calls, /* isHaltOnError */ true)
```

## `callListMethod` — small lists in memory

Loads everything via auto-paging into a single array. Works for the classic shape (`{ result: [...] }`) by default; for v3 entities pass `customKey: 'items'`.

```ts
// Classic API (uppercase fields, default customKey)
const list = await $b24.callListMethod('crm.deal.list', {
  filter: { '!STAGE_ID': 'LOST' },
  select: ['ID', 'TITLE', 'OPPORTUNITY']
})
const deals = list.getData() // array

// v3 API (camelCase fields)
const items = await $b24.callListMethod(
  'crm.item.list',
  {
    entityTypeId: EnumCrmEntityTypeId.company,
    filter: { '=%title': 'A%' },
    select: ['id', 'title']
  },
  /* progress */ null,
  /* customKey */ 'items'
)
```

Optional `progress` callback receives `0..100`.

## `fetchListMethod` — large lists, streaming

Memory-efficient. Yields chunks via async iterator. Always pass an `idKey` matching the response shape:

| Method | `idKey` | Response wrapper |
|---|---|---|
| `crm.item.list` (v3) | `'id'` | `'items'` |
| `crm.deal.list`, `crm.contact.list` (classic) | `'ID'` | default (`'result'`) |
| `tasks.task.list` | `'id'` | `'tasks'` |
| `user.get` | `'ID'` | default |

```ts
for await (const chunk of $b24.fetchListMethod(
  'crm.item.list',
  {
    entityTypeId: EnumCrmEntityTypeId.deal,
    select: ['id', 'title'],
    order: { id: 'asc' }
  },
  /* idKey */ 'id',
  /* customKey */ 'items'
)) {
  for (const deal of chunk) {
    await processDeal(deal)
  }
}
```

For very large datasets, `fetchListMethod` uses the fast-iterator strategy (filtering by `>id`) — it requires an ascending sort on the id field.

## Manual paging — when you need full control

```ts
import type { AjaxResult } from '@bitrix24/b24jssdk'

let page: AjaxResult = await $b24.callMethod('crm.deal.list', {
  filter: { STAGE_ID: 'NEW' },
  order: { ID: 'ASC' },
  select: ['ID', 'TITLE']
}, /* start */ 0)

const all: any[] = [...(page.getData().result as any[])]
while (page.isMore()) {
  await new Promise((r) => setTimeout(r, 50)) // your throttle
  const next = await page.getNext($b24.getHttpClient())
  if (next === false) break
  all.push(...(next.getData().result as any[]))
  page = next
}
```

`page.getTotal()` returns the total count (set after the first call).

## Result objects — quick reference

```ts
const res = await $b24.callMethod('crm.item.list', {
  entityTypeId: EnumCrmEntityTypeId.deal
})

res.isSuccess          // boolean
res.getData()          // raw payload
res.getTotal()         // total count for list methods
res.isMore()           // there is a next page
res.getNext(client)    // fetch next page (Promise<AjaxResult | false>)
res.getErrors()        // array of error objects (empty when success)
```

`callBatch` returns `Result` (not `AjaxResult`):

```ts
const batch = await $b24.callBatch(calls, false)
batch.isSuccess
batch.getData()        // record or array (mirrors call shape)
batch.getErrors()
```

## Anti-patterns

- ❌ Calling `crm.item.list` in a `for` loop with `start += 50` to walk pages — use `callListMethod` or `fetchListMethod`. They handle the cursor.
- ❌ `Promise.all([list page 1, list page 2, ...])` with classic offset — Bitrix24 paging is not stable in parallel; chunk via `callBatchByChunk` instead.
- ❌ `await $b24.callBatch(thousand_calls)` — exceeds the 50-call limit. Use `callBatchByChunk`.
- ❌ Forgetting `customKey: 'items'` for `crm.item.list` paging — you'll silently get only the first page.
- ❌ `B24Hook` in a browser bundle — leaks the webhook secret. Use `B24Frame` there.
