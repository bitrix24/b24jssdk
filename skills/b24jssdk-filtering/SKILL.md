---
name: b24jssdk-filtering
description: Build filter, order, and select parameters for Bitrix24 REST methods called via b24jssdk's actions.v{2,3}.* API. Covers the v2 prefix dialect (>=, <=, !, %, =%), the v3 array-triple dialect ([['field', 'op', value]]), NOT, multi-value (IN), dates via Text.toB24Format, and the order-stripping rule of callList. Load when building filtered queries.
---

# b24jssdk filtering

Bitrix24 has **two filter dialects**. They are not interchangeable — each API version accepts only its own. Pick the dialect that matches the action surface you're using.

## v2 — prefix-keyed object

Used by `$b24.actions.v2.{call,callList,fetchList}.make({ params: { filter: ... }})`. The operator is a prefix on the field name.

```ts
filter: {
  '>=opportunity': 50000,
  '<=opportunity': 200000,
  '!stageId': 'LOST',
  '=%title': 'A%'
}
```

### v2 operators

| Prefix | Meaning | Example |
|---|---|---|
| (none) | exact match | `{ stageId: 'NEW' }` |
| `>=` | greater or equal | `{ '>=opportunity': 50000 }` |
| `>`  | greater | `{ '>id': 100 }` |
| `<=` | less or equal | `{ '<=opportunity': 200000 }` |
| `<`  | less | `{ '<closeDate': '2026-01-01' }` |
| `!`  | not equal | `{ '!stageId': 'LOST' }` |
| `!=` | not equal (alternate) | `{ '!=stageId': 'LOST' }` |
| `%`  | LIKE (substring, case-insensitive) | `{ '%title': 'поставка' }` |
| `=%` | LIKE with explicit pattern (`%`/`_`) | `{ '=%title': 'A%' }` |
| `!%` | NOT LIKE | `{ '!%title': 'тест' }` |

Multiple keys are combined with AND. Two operators on the same field need two separate keys: `{ '>=opportunity': 50000, '<=opportunity': 200000 }`.

### v2 IN / multi-value

Plain array means `IN`:

```ts
filter: { stageId: ['NEW', 'PREPARATION', 'EXECUTING'] }
```

For "not in":

```ts
filter: { '!stageId': ['LOST', 'WON'] }
```

## v3 — array of triples

Used by `$b24.actions.v3.{call,callList,fetchList,aggregate}.make({ params: { filter: ... }})`. The filter is a JSON **array**, each element is a condition.

```ts
filter: [
  ['stageId', '=', 'NEW'],
  ['createdTime', '>=', '2026-01-01T00:00:00+03:00'],
  ['responsible', 'in', [1, 2, 3]]
]
```

### v3 operators — exhaustive list (only these 8)

```
=   !=   >   >=   <   <=   in   between
```

> **No `%`, `like`, `~`, or substring operator** at the v3 protocol level — `Filtering/Operator.php` does not define one. Substring search is currently a v2-only feature.

`between` value must be a 2-element array: `[min, max]`.
`in` value must be an array.

### v3 condition forms

The two-arg form is sugar:

```ts
['id', 42]            // same as ['id', '=', 42]
['stageId', ['A', 'B']] // same as ['stageId', 'in', ['A', 'B']]
```

The long struct form supports nested groups with `or` logic and negation (rarely needed in user code):

```ts
filter: [
  ['status', '=', 'OPEN'],
  {
    type: 'filter',
    logic: 'or',
    negative: false,
    conditions: [
      ['priority', '=', 'HIGH'],
      ['responsible', '=', 42]
    ]
  }
]
```

The top-level array is implicitly `logic: 'and'`.

## `order` rule for callList / fetchList

Both `actions.v{2,3}.callList.make` and `fetchList.make` **strip user-supplied `order`** and force `{ [idKey]: 'ASC' }` because the action uses keyset cursor pagination. If you pass an `order`, the SDK logs a warning (`callList.make: user-provided 'order' parameter is ignored…`) and discards it (see `packages/jssdk/src/core/actions/v2/call-list.ts:77-79` and the v3 equivalent).

If you need a specific sort order, drop down to `call.make` and page manually — but you almost certainly want to filter more narrowly instead.

## `order` for single `call.make`

- **v2**: object with values `'asc' | 'desc' | 'ASC' | 'DESC'` — `order: { id: 'asc', amount: 'desc' }`.
- **v3**: object form **only** (`{ field: 'asc' | 'desc' }`). Arrays throw `InvalidOrderException`. The DTO field must carry the server-side `#[Sortable]` attribute or you'll get `DtoFieldRequiredAttributeException`.

## Dates

Use the SDK helper `Text.toB24Format(date)` — it produces the Bitrix24 format `yyyy-MM-dd'T'HH:mm:ssZZ` and handles `Date | DateTime | string` inputs (per `packages/jssdk/src/tools/text.ts:213-226`).

```ts
import { Text } from '@bitrix24/b24jssdk'

const sixMonthsAgo = new Date()
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

// v2
filter: { '>=createdTime': Text.toB24Format(sixMonthsAgo) }

// v3
filter: [['createdTime', '>=', Text.toB24Format(sixMonthsAgo)]]
```

## Field naming — v2 (classic vs v3-style)

The same logical field has different names depending on the method:

| Logical | Classic methods (`crm.deal.list`, …) | v3-style methods (`crm.item.list`) |
|---|---|---|
| ID | `ID` | `id` |
| Title | `TITLE` | `title` |
| Stage | `STAGE_ID` | `stageId` |
| Amount | `OPPORTUNITY` | `opportunity` |
| Currency | `CURRENCY_ID` | `currencyId` |
| Created | `DATE_CREATE` | `createdTime` |
| Modified | `DATE_MODIFY` | `updatedTime` |
| Assigned to | `ASSIGNED_BY_ID` | `assignedById` |
| Custom field | `UF_CRM_INN` | `ufCrmInn` |

> Both shapes are v2-API. The casing is per-method, not per-API-version. Use the same casing across `filter`, `select`, and (where applicable) `order`. Mixing styles silently breaks paging.

## Select

Always pass `select` to limit response size:

```ts
select: ['id', 'title', 'stageId', 'opportunity', 'currencyId']
```

For custom fields, list them explicitly. For v3, dot syntax expands relations:

```ts
// v3 only
select: ['id', 'title', 'responsible.name', 'responsible.email']
```

## Examples

### v2 — open deals with amount range

```ts
const response = await $b24.actions.v2.callList.make<CrmItem>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    filter: {
      '!stageId': ['WON', 'LOSE'],
      '>=opportunity': 50000,
      '<=opportunity': 200000
    },
    select: ['id', 'title', 'stageId', 'opportunity']
  },
  idKey: 'id',
  customKeyForResult: 'items'
})
```

### v2 — contacts by phone substring

```ts
const response = await $b24.actions.v2.callList.make<CrmItem>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.contact,
    filter: { '%phone': '+7916' },
    select: ['id', 'name', 'lastName', 'phone']
  },
  idKey: 'id',
  customKeyForResult: 'items'
})
```

### v2 — tasks not closed

```ts
const response = await $b24.actions.v2.callList.make<TaskItem>({
  method: 'tasks.task.list',
  params: {
    filter: { '!REAL_STATUS': 5 }, // 5 = COMPLETED
    select: ['ID', 'TITLE', 'STATUS', 'RESPONSIBLE_ID']
  },
  idKey: 'ID',                   // classic uppercase id
  customKeyForResult: 'tasks'
})
```

### v3 — eventlog last 6 months

```ts
const sixMonthsAgo = new Date()
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
sixMonthsAgo.setHours(0, 0, 0, 0)

const response = await $b24.actions.v3.callList.make<EventItem>({
  method: 'main.eventlog.list',
  params: {
    filter: [['timestampX', '>=', Text.toB24Format(sixMonthsAgo)]],
    select: ['id', 'userId']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  limit: 200
})
```

### v3 — IN / between

```ts
filter: [
  ['responsibleId', 'in', [1, 2, 3]],
  ['createdTime', 'between', ['2026-01-01T00:00:00+03:00', '2026-03-31T23:59:59+03:00']]
]
```

## Multi-funnel pipelines (CRM)

On portals with multiple funnels, stage IDs come prefixed: `C2:WON`, `C4:LOSE`. Strategies:

- Filter by category ID and base stage: `filter: { categoryId: 2, stageId: 'NEW' }`.
- Enumerate full list explicitly: `filter: { stageId: ['C2:WON', 'C4:WON'] }`.
- Don't trust a bare `'NEW'` to match across funnels — read the live stage list from `crm.dealcategory.stage.list`.

## Anti-patterns

- ❌ `filter: { stageId: { $gte: 100 } }` — MongoDB-style. Not understood by Bitrix24, will 400.
- ❌ `filter: [['title', 'like', 'A%']]` — `like` is not in the v3 operator set. Use v2 + `=%` for substring search.
- ❌ Passing `order` to `callList.make` / `fetchList.make` — silently discarded with a warning.
- ❌ Mixing `STAGE_ID` and `stageId` across `filter` and `select` — they're different fields per method.
- ❌ Forgetting timezone in date strings — Bitrix24 portals are configured in a portal timezone. Use `Text.toB24Format()` to stay consistent.
- ❌ Using v3 array-of-triples filter for `actions.v2.*` — silently misparsed and returns wrong results.
- ❌ Using v2 prefix-keyed filter for `actions.v3.*` — returns `UnknownFilterOperatorException`.
