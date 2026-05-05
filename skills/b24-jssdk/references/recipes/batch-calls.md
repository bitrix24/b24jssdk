# Batch calls

`callBatch` lets you send multiple REST calls in one request. Use it whenever:

- You need 2+ related calls and round-trip latency matters.
- You want a transactional "all-or-nothing" group (`isHaltOnError=true`).
- You're collecting independent data sets (list of companies + list of contacts) — `isHaltOnError=false` accumulates per-command errors.

For batches larger than ~50 commands, use `callBatchByChunk` — the SDK chunks them for you.

## Two call shapes

### Object-keyed (frontend-friendly)

```ts
import { Result } from '@bitrix24/b24jssdk'

const batch: Result = await $b24.callBatch({
  CompanyList: {
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.company,
      order: { id: 'desc' },
      select: ['id', 'title']
    }
  },
  ContactList: {
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.contact,
      select: ['id', 'name']
    }
  }
}, true) // isHaltOnError = true (default)

const data = batch.getData()
const companies = data.CompanyList.items ?? []
const contacts = data.ContactList.items ?? []
```

Use the object form when keys make the receiving code clearer (named results map cleanly to UI sections, etc.).

### Array (server-friendly)

```ts
const batch: Result = await $b24.callBatch([
  ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'] }],
  ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'] }]
], true)
```

Use the array form when the calls are homogeneous (e.g. paging through the same method) — `getData()` returns an indexed result.

## Halt-on-error semantics

| `isHaltOnError` | Behaviour |
|---|---|
| `true` (default) | Promise rejects on the first failing command. Use for transactional groups |
| `false` | Promise resolves; per-command errors live in `result.getErrors()`. Use when partial results are still useful |

```ts
const batch = await $b24.callBatch(calls, false)
if (!batch.isSuccess) {
  for (const err of batch.getErrors()) {
    console.warn('partial failure', err)
  }
}
```

## `returnAjaxResult` — per-command `AjaxResult`

```ts
const batch = await $b24.callBatch(calls, true, true)
// batch.getData() now contains AjaxResult objects per command
// — useful when individual commands return paginated results
```

Reach for this only when you actually need `isMore()` / `getNext()` per command. Otherwise the default flat shape is simpler.

## `callBatchByChunk` — large batches

Bitrix24 caps batch size at 50 commands. For larger groups:

```ts
import { type AjaxResultParams } from '@bitrix24/b24jssdk'

const calls = ids.map(id => ([
  'crm.item.update',
  { entityTypeId: EnumCrmEntityTypeId.deal, id, fields: { stageId: 'WON' } }
]) as [string, AjaxResultParams])

const result = await $b24.callBatchByChunk(calls, true)
```

The SDK splits into 50-command chunks, executes them sequentially, and merges results into a single `Result`. Limiter throttling applies between chunks.

## Choosing batch vs list

- Need a known set of *different* methods → `callBatch` (object form).
- Need *all* rows of one method → `callListMethod` or `fetchListMethod` (see [list-pagination](list-pagination.md)).
- Need to mutate a known array of rows → `callBatchByChunk` with one update per row.

## Anti-patterns

- Wrapping every call in a one-element batch — adds overhead for no benefit.
- Writing your own `chunkArray` loop around `callBatch` — `callBatchByChunk` already exists.
- Mixing object and array shapes inside a single `callBatch` call.
- Using `isHaltOnError=true` then a `try/catch` *and* expecting partial results — pick one strategy.
