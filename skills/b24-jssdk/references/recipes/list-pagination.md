# List pagination

Three strategies — pick by dataset size and control needs.

## Decision matrix

| Dataset | Control needed | Use | Returns |
|---|---|---|---|
| Small (< 1000 known) | None | `callListMethod` | `Promise<Result>` (full array via `getData()`) |
| Large / unknown | None | `fetchListMethod` | `AsyncGenerator<any[]>` (iterate with `for await`) |
| Any | Custom paging, pauses, dynamic stop conditions | `callMethod` + `getNext()` | manual `AjaxResult` chain |

## A) Small datasets — `callListMethod`

Loads everything into memory. Simple, but watch heap usage above ~1000 items.

```ts
import { EnumCrmEntityTypeId, Result } from '@bitrix24/b24jssdk'

const response: Result = await $b24.callListMethod(
  'crm.item.list',
  {
    entityTypeId: EnumCrmEntityTypeId.company,
    order: { id: 'asc' },
    select: ['id', 'title']
  },
  (progress: number) => {
    // optional 0..100 callback
  }
)

const items = response.getData() as any[]
```

A fourth `customKey` argument lets you target a non-default response key — needed for some non-CRM list methods.

## B) Large datasets — `fetchListMethod` (preferred)

Streams chunks via async iterator; constant memory regardless of total size.

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

for await (const chunk of $b24.fetchListMethod(
  'crm.item.list',
  { entityTypeId: EnumCrmEntityTypeId.deal, select: ['id', 'title'] },
  'id' // idKey
)) {
  for (const row of chunk) {
    // process row
  }
}
```

**`idKey` matters.** For `crm.item.list` payloads (v3 entities) the field is lowercase `id`. For older v2-style methods (`crm.deal.list`, `crm.lead.list`, …) it's uppercase `'ID'` (also the default). When in doubt, log one chunk and check the key casing.

## C) Manual paging — `callMethod` + `getNext()`

Use when you need pauses, dynamic stop conditions, or custom backoff between pages.

```ts
import { EnumCrmEntityTypeId, AjaxResult } from '@bitrix24/b24jssdk'

const all: any[] = []

let page: AjaxResult = await $b24.callMethod('crm.item.list', {
  entityTypeId: EnumCrmEntityTypeId.contact,
  order: { id: 'asc' },
  select: ['id', 'name']
}, 0) // start cursor

all.push(...(page.getData().result as any[]))

while (page.isMore()) {
  const next = await page.getNext($b24.getHttpClient())
  if (next === false) break

  // your throttling / dynamic stop checks here
  all.push(...(next.getData().result as any[]))
  page = next
}
```

## Pitfalls

- **Wrong `idKey` in `fetchListMethod`** — the iterator silently never advances. If a fetch loop hangs at the first chunk, double-check the key casing.
- **Calling `getData()` on a list `Result` and expecting an object** — `callListMethod` returns an array. The single-call `getData()` shape is different.
- **Building a `for ... of` over `fetchListMethod`** — it's async; use `for await ... of`.
- **Manually re-implementing C** for what fits B — only reach for manual paging when you genuinely need control.

See [batch-calls](batch-calls.md) for `callBatchByChunk` (mutating bulk arrays) and [rate-limiting](../guidelines/rate-limiting.md) for throttle tuning on long fetches.
