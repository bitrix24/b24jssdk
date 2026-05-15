# Batch calls

`b24.actions.v3.batch.make` (or `v2.batch.make`) packs multiple REST calls into one round-trip. Reach for it whenever you need 2+ related calls and latency matters. For batches larger than 50 commands use `batchByChunk.make` — the SDK splits and merges for you.

The legacy `$b24.callBatch(...)` still works but is deprecated; new code uses the action managers.

## Three input shapes

`b24.actions.v{2,3}.batch.make` accepts any of:

1. **Array of tuples** — homogeneous batch of similar calls:

```ts
import { Result } from '@bitrix24/b24jssdk'

const response = await $b24.actions.v3.batch.make({
  calls: [
    ['tasks.task.get', { id: 1, select: ['id', 'title'] }],
    ['tasks.task.get', { id: 2, select: ['id', 'title'] }],
    ['tasks.task.get', { id: 3, select: ['id', 'title'] }]
  ],
  options: {
    isHaltOnError: true,
    requestId: 'tasks-batch'
  }
})
```

2. **Array of objects** — same as tuples but with named keys for readability:

```ts
await $b24.actions.v3.batch.make({
  calls: [
    { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
    { method: 'tasks.task.get', params: { id: 2, select: ['id', 'title'] } }
  ]
})
```

3. **Named object** — when you want results keyed for the consumer:

```ts
interface TaskItem { id: number, title: string }
interface LogItem { id: number, userId: number }

const response = await $b24.actions.v3.batch.make<{ item: TaskItem } | { items: LogItem[] }>({
  calls: {
    Task: { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
    Log: ['main.eventlog.list', { select: ['id', 'userId'], pagination: { limit: 5 } }]
  },
  options: {
    isHaltOnError: true,
    returnAjaxResult: true
  }
})

const data = response.getData() as Record<string, AjaxResult<any>>
console.log(data.Task.getData().result.item)
console.log(data.Log.getData().result.items)
```

Pick the shape that makes the consuming code clearest. The action class handles all three uniformly.

## `options` block

| Field | Default | Meaning |
|---|---|---|
| `isHaltOnError` | `true` | Stop on first failing command; the whole promise rejects. Set `false` to accumulate per-command errors |
| `returnAjaxResult` | `false` | Wrap each result in `AjaxResult` so you can call `isMore()`, `getData()` etc. per command |
| `requestId` | `undefined` | Stable id for tracking / dedup / debug logs |

```ts
const response = await $b24.actions.v3.batch.make({
  calls,
  options: {
    isHaltOnError: false,
    requestId: 'crm-sync-2026-05'
  }
})

if (!response.isSuccess) {
  for (const [index, err] of response.errors) {
    console.warn('partial failure', index, err)
  }
}
```

## Auto-chunked batch — `batchByChunk.make`

A single batch is capped at 50 commands. For larger groups (e.g. updating 500 deals), `batchByChunk` splits internally and runs the chunks sequentially, respecting the limiter:

```ts
import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'

const commands: BatchCommandsArrayUniversal = ids.map((id) => [
  'tasks.task.get',
  { id, select: ['id', 'title'] }
])

const response = await $b24.actions.v3.batchByChunk.make<{ item: TaskItem }>({
  calls: commands,
  options: {
    isHaltOnError: false,
    requestId: 'tasks-bulk-fetch'
  }
})

const items = response.getData() // flat T[] of successful rows
```

Notes:

- **Named-object input is not supported** for `batchByChunk` — chunks couldn't preserve named keys reliably. Use array shapes.
- **`returnAjaxResult` is forced to `false`** — the action flattens results to `T[]`.
- For very large operations (10 000+ commands) consider server-side task queues instead.

## v2 vs v3

Both versions expose identical action names and option shapes. Differences live in the REST methods themselves:

- v3 — newer methods (`tasks.task.*`, `main.eventlog.*`, …). Some methods only exist in v3.
- v2 — older surface, mandatory for legacy CRM-style methods (`crm.item.list`, `crm.deal.list`, etc.).

If a method exists in v3 but you call it through `v2.call.make`, the SDK logs a warning suggesting the migration. Pick the version that matches the REST method — when in doubt, try v3 first; if you get `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`, fall back to v2.

## Choosing batch vs list

- Different methods, known set → `batch.make` (named object form).
- All rows of one list method → `callList.make` / `fetchList.make` (see [list-pagination](list-pagination.md)).
- Update/mutate a known array of rows → `batchByChunk.make`.

## Anti-patterns

- Wrapping a single call in `batch.make` — adds overhead for no benefit. Use `call.make`.
- Hand-rolling chunking around `batch.make` — `batchByChunk.make` already does it correctly.
- Mixing shapes in one call — pick array OR named object, don't combine.
- Both `isHaltOnError: true` AND `try/catch` for partial recovery — pick one strategy.
