---
name: b24jssdk-filtering
description: Build filters, sorts, and selects for Bitrix24 *.list / *.get / *.search methods called via b24jssdk. Covers prefix operators (>=, <=, !, %, =%), NOT, dates, multi-value (IN), case sensitivity, sort syntax, and field-naming differences between v3 (crm.item.*) and classic methods. Load when building filtered queries.
---

# b24jssdk filtering

Bitrix24 REST has **one** filter style — operator as a **prefix on the field name** in the `filter` object. Forget the MongoDB-style `$gt/$lt/$ne` you may see in VibeCode docs; that is a VibeCode-only convention and is not what reaches Bitrix24.

## Operator prefixes

| Prefix | Meaning | Example |
|---|---|---|
| (none) | exact match | `{ STAGE_ID: 'NEW' }` |
| `>=` | greater or equal | `{ '>=OPPORTUNITY': 50000 }` |
| `>`  | greater | `{ '>id': 100 }` |
| `<=` | less or equal | `{ '<=OPPORTUNITY': 200000 }` |
| `<`  | less | `{ '<closeDate': '2026-01-01' }` |
| `!`  | not equal | `{ '!STAGE_ID': 'LOST' }` |
| `!=` | not equal (alternate) | `{ '!=STAGE_ID': 'LOST' }` |
| `%`  | LIKE (substring, case-insensitive) | `{ '%TITLE': 'поставка' }` |
| `=%` | LIKE with explicit pattern (`%`/`_`) | `{ '=%title': 'A%' }` |
| `!%` | NOT LIKE | `{ '!%TITLE': 'тест' }` |

> Multiple keys in the same `filter` object are combined with AND. Two operators on the same field need two separate keys: `{ '>=OPPORTUNITY': 50000, '<=OPPORTUNITY': 200000 }`.

## IN / multi-value

Pass an array — Bitrix24 turns it into a SQL `IN`:

```ts
{ filter: { STAGE_ID: ['NEW', 'PREPARATION', 'EXECUTING'] } }
```

For "not in":

```ts
{ filter: { '!STAGE_ID': ['LOST', 'WON'] } }
```

## Field-name conventions

The same logical field has **different names** in classic vs v3 methods:

| Logical | Classic (`crm.deal.list`, `crm.contact.list`) | v3 (`crm.item.list`) |
|---|---|---|
| ID | `ID` | `id` |
| Title | `TITLE` | `title` |
| Stage | `STAGE_ID` | `stageId` |
| Amount | `OPPORTUNITY` | `opportunity` |
| Currency | `CURRENCY_ID` | `currencyId` |
| Created | `DATE_CREATE` | `createdTime` |
| Modified | `DATE_MODIFY` | `updatedTime` |
| Assigned to | `ASSIGNED_BY_ID` | `assignedById` |
| Phone | `PHONE` (multi-value) | `phone` (multi-value) |
| Custom field | `UF_CRM_INN` | `ufCrmInn` |

**Use the same casing in `filter`, `select`, and `order`**. Mixing styles silently breaks paging.

## Dates

Bitrix24 accepts ISO 8601 strings everywhere:

```ts
{ filter: { '>=DATE_CREATE': '2026-01-01T00:00:00+03:00' } }
{ filter: { '>=createdTime': '2026-04-01T00:00:00Z' } }
```

For "today onwards" prefer the SDK's `Text.toISOString` to keep timezone consistent:

```ts
import { Text } from '@bitrix24/b24jssdk'

const since = Text.toISOString(new Date(Date.now() - 7 * 24 * 3600_000))
{ filter: { '>=createdTime': since } }
```

## Sort

`order` (classic) / `order` (v3) maps fields to `'asc'` / `'desc'`:

```ts
order: { id: 'asc' }                    // single field
order: { id: 'asc', amount: 'desc' }    // multi-field, in insertion order
```

For `fetchListMethod` to use the fast iterator on `crm.item.list`, sort must include the id field ascending.

## Select

Always pass `select` to limit response size:

```ts
select: ['id', 'title', 'stageId', 'opportunity', 'currencyId']
```

For custom fields you want back, list them explicitly: `'ufCrmInn'`.

## Filter as a Map vs object

A plain object preserves insertion order in modern JS, which Bitrix24 uses for `order`. Don't JSON-roundtrip a filter through code that re-orders keys.

## Examples

### Deals: open with amount range

```ts
const res = await $b24.callListMethod(
  'crm.item.list',
  {
    entityTypeId: EnumCrmEntityTypeId.deal,
    filter: {
      '!stageId': ['WON', 'LOST'],
      '>=opportunity': 50000,
      '<=opportunity': 200000
    },
    order: { id: 'asc' },
    select: ['id', 'title', 'stageId', 'opportunity']
  },
  null,
  'items'
)
```

### Contacts: phone substring

```ts
const res = await $b24.callListMethod(
  'crm.item.list',
  {
    entityTypeId: EnumCrmEntityTypeId.contact,
    filter: { '%phone': '+7916' },
    select: ['id', 'name', 'lastName', 'phone']
  },
  null,
  'items'
)
```

### Tasks: not closed

```ts
const res = await $b24.callListMethod('tasks.task.list', {
  filter: { '!REAL_STATUS': 5 }, // 5 = COMPLETED
  select: ['ID', 'TITLE', 'STATUS', 'RESPONSIBLE_ID']
})
// fetchListMethod for tasks: idKey='ID', customKey='tasks'
```

### Lead: created in Q1 2026

```ts
const res = await $b24.callListMethod('crm.lead.list', {
  filter: {
    '>=DATE_CREATE': '2026-01-01T00:00:00+03:00',
    '<=DATE_CREATE': '2026-03-31T23:59:59+03:00'
  },
  select: ['ID', 'TITLE', 'STATUS_ID', 'DATE_CREATE']
})
```

### Deal: ufCrm field

```ts
const res = await $b24.callMethod('crm.item.list', {
  entityTypeId: EnumCrmEntityTypeId.deal,
  filter: { ufCrmInn: '7701234567' },
  select: ['id', 'title', 'ufCrmInn']
})
```

## Multi-funnel pipelines

On portals with multiple funnels, stage IDs carry a category prefix (`C2:WON`, `C4:NEW`). Strategies:

- Filter by category ID: `{ categoryId: 2, stageId: 'NEW' }`.
- Filter by full stage list: `{ stageId: ['C2:WON', 'C4:WON'] }`.
- Don't trust a bare `'NEW'` to match across funnels — read the active stage list from `crm.dealcategory.stage.list`.

## Search endpoints exist for some entities

Classic search methods (`crm.duplicate.findbycomm`, `crm.contact.list` with `'%'` filter) cover most cases. There is no universal `*/search` endpoint in Bitrix24 REST — that's a VibeCode wrapper. Use `*.list` with prefix filters.

## Anti-patterns

- ❌ Mixing `STAGE_ID` and `stageId` in the same filter (they are different fields per method version).
- ❌ Using `$gt`, `$gte`, `$ne`, `$contains` — those are VibeCode-only.
- ❌ Filter on `phone: '+7916...'` for `crm.contact.list` (classic) — phone is multi-value; use `'%PHONE'` instead.
- ❌ Forgetting timezone in date strings — Bitrix24 portals are configured in a portal timezone; mix in UTC and you'll silently lose a day.
