# REST API v3 (`b24.actions.v3.*`)

Comprehensive reference for the v3 REST surface. Mirrors [rest-api-v2](rest-api-v2.md) — same action names, same `make({ … })` shape, different HTTP client and cursor schemes underneath.

## When to use v3 — and when not to

> **At this stage of the SDK, v3 supports only a small set of methods.** For most real-world code you'll be calling [v2](rest-api-v2.md). Use v3 when your method is in the supported list below; otherwise reach for v2 and switch later as the v3 surface grows.

**Currently v3-supported methods** (from `packages/jssdk/src/core/version-manager.ts`):

- `/batch`, `/scopes`, `/rest.scope.list`, `/rest.documentation.openapi`, `/documentation`
- `/main.eventlog.list`, `/main.eventlog.get`, `/main.eventlog.tail`
- `/tasks.task.add`, `/tasks.task.get`, `/tasks.task.update`, `/tasks.task.delete`
- `/tasks.task.access.get`, `/tasks.task.file.attach`, `/tasks.task.chat.message.send`

CRM (`crm.item.*`, `crm.deal.*`, …), IM (`im.*`), `user.current`, `profile`, placement, options, and the rest of the surface area is **v2-only** at the moment.

Behaviour when you reach outside the supported list:

- `b24.actions.v3.call.make({ method: 'crm.item.list', ... })` throws `SdkError(JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3)` immediately.
- `b24.actions.v3.batch.make({ calls: [...] })` checks every method in the batch; if even one isn't v3, the whole call throws the same error. You cannot mix v2-only and v3-supported methods inside a single v3 batch.

Practical guidance: **prefer v2 by default; switch the specific call to v3 only when the method is on the list above.** Skill recipes use v2 in their examples for that reason.

## Surface

| Action | Path | Returns |
|---|---|---|
| Single call | `b24.actions.v3.call.make` | `Promise<AjaxResult<T>>` |
| Auto-paged list | `b24.actions.v3.callList.make` | `Promise<Result<T[]>>` |
| Streamed list | `b24.actions.v3.fetchList.make` | `AsyncGenerator<T[]>` |
| Batch (≤ 50) | `b24.actions.v3.batch.make` | `Promise<CallBatchResult<T>>` |
| Auto-chunked batch | `b24.actions.v3.batchByChunk.make` | `Promise<Result<T[]>>` |

## Single call — `call.make`

```ts
interface TaskItem { id: number, title: string }

const response = await $b24.actions.v3.call.make<{ task: TaskItem }>({
  method: 'tasks.task.get',
  params: {
    id: 123,
    select: ['id', 'title']
  },
  requestId: 'task-123'
})

if (!response.isSuccess) {
  throw new Error(response.getErrorMessages().join('; '))
}
console.log(response.getData().result.task.title)
```

Options: `{ method, params?, requestId? }`.

## Auto-paged list — `callList.make`

Loads the entire dataset into memory. Use for known small sets (< 1000 items).

```ts
import { Text } from '@bitrix24/b24jssdk'

interface LogItem { id: number, userId: number }

const sixMonthAgo = new Date()
sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6)

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
  limit: 200
})

const items: LogItem[] = response.getData() ?? []
```

Options: `{ method, params?, idKey?, customKeyForResult, requestId?, limit? }`.

- **`customKeyForResult` is required** (no default in v3). Pass the payload-array key, e.g. `'items'`.
- `idKey?` — id field for cursor pagination. Default `'id'` (lowercase).
- `limit?` — page size; default `50`, max `1000`.
- `order` (if provided) is **ignored** — cursor pagination orders by `idKey`. Use `filter`.
- v3 filter shape is an **array of triples**: `[['timestampX', '>=', '...'], ['userId', '=', 5]]`. Different from v2's operator-prefixed object form.

## Streamed list — `fetchList.make` (preferred for large datasets)

Async generator — constant memory regardless of total size.

```ts
import { Text } from '@bitrix24/b24jssdk'

interface LogItem { id: number, userId: number }

const generator = $b24.actions.v3.fetchList.make<LogItem>({
  method: 'main.eventlog.list',
  params: {
    filter: [['timestampX', '>=', Text.toB24Format(sixMonthAgo)]],
    select: ['id', 'userId']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'log-stream',
  limit: 200
})

for await (const chunk of generator) {
  for (const row of chunk) {
    // process row
  }
}
```

Same options as `callList.make`. Errors throw `SdkError` with code `JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V3` on the `for await` iteration.

`fetchList.make` is **not async itself** — it returns the generator synchronously; iteration drives the calls.

## Batch — `batch.make`

Up to 50 commands per call. **All commands must be v3-supported** or the call throws `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`. Three input shapes:

```ts
interface TaskItem { id: number, title: string }

// 1) Array of tuples
await $b24.actions.v3.batch.make({
  calls: [
    ['tasks.task.get', { id: 1, select: ['id', 'title'] }],
    ['tasks.task.get', { id: 2, select: ['id', 'title'] }]
  ],
  options: { isHaltOnError: true, requestId: 'tasks-pair' }
})

// 2) Array of objects
await $b24.actions.v3.batch.make({
  calls: [
    { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
    { method: 'tasks.task.get', params: { id: 2, select: ['id', 'title'] } }
  ]
})

// 3) Named object — results keyed by name
interface MainEventLogItem { id: number, userId: number }

const response = await $b24.actions.v3.batch.make<{ task: TaskItem } | { items: MainEventLogItem[] }>({
  calls: {
    Task: { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
    Log: ['main.eventlog.list', { select: ['id', 'userId'], pagination: { limit: 5 } }]
  },
  options: {
    isHaltOnError: true,
    returnAjaxResult: true,
    requestId: 'tasks-and-log'
  }
})

const data = response.getData() as Record<'Task' | 'Log', AjaxResult<{ task: TaskItem } | { items: MainEventLogItem[] }>>
console.log(data.Task.getData().result)
console.log(data.Log.getData().result)
```

`options`: same as v2 (`isHaltOnError`, `returnAjaxResult`, `requestId`).

Note on `restApi:v3` batches: **all-or-nothing**. Per-command errors are not returned individually. If any one command fails the whole batch fails and `response.getErrorMessages()` carries the error. (`isHaltOnError: false` therefore has less meaning in v3 than in v2.)

## Auto-chunked batch — `batchByChunk.make`

Same constraints as v2: array shapes only (no named-object), `returnAjaxResult` forced to `false`.

```ts
import type { BatchCommandsArrayUniversal } from '@bitrix24/b24jssdk'

const commands: BatchCommandsArrayUniversal = ids.map((id) => [
  'tasks.task.update',
  { id, fields: { status: '5' } }
])

const response = await $b24.actions.v3.batchByChunk.make({
  calls: commands,
  options: { isHaltOnError: false, requestId: 'tasks-bulk-update' }
})

const okRows = response.getData() // flat T[] of successful rows
```

## Choosing between actions

| Need | Use |
|---|---|
| One call, one v3 method | `call.make` |
| All rows of one v3 list method, known small | `callList.make` |
| All rows of one v3 list method, large/unknown | `fetchList.make` |
| Different v3 methods in one round-trip (≤ 50) | `batch.make` |
| Mutate / read N rows where N > 50 | `batchByChunk.make` |
| Counting elements without listing them | `aggregate` action with `count` / `countDistinct` (v3-only) |

Manual paging via `AjaxResult.isMore()` / `getNext()` / `getTotal()` is **v2-only** — v3 returns no `next` / `total` envelope. If you need a total count in v3, use the `aggregate` action.

## Pitfalls

- **Calling a v2-only method via `v3.call.make`** — throws immediately. Move the call to `v2.call.make` or pick a v3-supported method.
- **Missing `customKeyForResult`** — required in v3. TypeScript catches it; runtime users sometimes cast around the type.
- **Wrong `idKey`** — default is `'id'` (lowercase) in v3. Match the field name your method actually returns.
- **Filter shape confusion** — v3 uses array-of-triples (`[['field', 'op', value]]`), not v2's operator-prefixed-object form.
- **Mixing v2-only and v3 methods in `v3.batch.make`** — the whole call throws. Split into two batches by version.
- **Expecting per-command error recovery in `v3.batch.make`** — v3 is all-or-nothing; switch to `v2.batch.make` (if all methods exist in v2) when you need partial-error semantics.

See [rest-api-v2](rest-api-v2.md) for the v2 mirror, [rate-limiting](../guidelines/rate-limiting.md) for tuning, and [error-handling](../guidelines/error-handling.md) for batch error semantics.
