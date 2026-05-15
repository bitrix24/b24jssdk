# List pagination — decision page

Choosing between `callList`, `fetchList`, and manual paging. Code examples live in the version-specific recipes:

- **v2 examples:** [rest-api-v2](rest-api-v2.md) — see the "Auto-paged list" and "Streamed list" sections.
- **v3 examples:** [rest-api-v3](rest-api-v3.md) — same sections, mirror structure.

## Decision matrix

| Dataset | Use | Returns |
|---|---|---|
| Small (< 1000 known) | `b24.actions.v{2,3}.callList.make` | `Promise<Result<T[]>>` — full array in memory |
| Large / unknown | `b24.actions.v{2,3}.fetchList.make` | `AsyncGenerator<T[]>` — iterate with `for await` |
| Custom paging on a v2 method (pauses, dynamic stop) | `b24.actions.v2.call.make` + `AjaxResult.isMore()` / `getNext()` | manual `AjaxResult` chain |

## v2 vs v3 lists

The action names are identical (`callList`, `fetchList`) but the underlying APIs differ:

| Aspect | v2 | v3 |
|---|---|---|
| Default `idKey` | `'ID'` | `'id'` |
| `customKeyForResult` | optional (default `null` — array is at response root) | **required** |
| Filter shape | object with operator-prefixed keys: `{ '>=createdTime': '...', '=%title': 'A%' }` | array of triples: `[['timestampX', '>=', '...']]` |
| Configurable `limit` | no | yes (default 50, max 1000) |
| Counting without listing | use `AjaxResult.getTotal()` on `call.make` (deprecated, removed in 2.0.0) | use the `aggregate` action with `count` / `countDistinct` |

Pick the version that matches the REST method. Most list methods today are v2 (`crm.item.list`, `crm.deal.list`, etc.); v3 currently has only `main.eventlog.list` and a handful of others. See [rest-api-v3](rest-api-v3.md) for the v3 method list.

## `callList.make` vs `fetchList.make`

- **`callList.make`** — accumulates everything in memory before returning. Easier code, but a 100 000-row list will exhaust the heap.
- **`fetchList.make`** — async generator, yields chunks as they arrive. Constant memory. Use this for anything you don't already know is small.

Cost-wise they're equivalent — both make the same number of REST calls with the same throttling. Pick by memory budget, not by REST budget.

## Manual paging (`AjaxResult.isMore` / `getNext`)

**v2-only and deprecated.** `AjaxResult.isMore()` / `getNext()` / `getTotal()` rely on the v2 `next` / `total` envelope fields and are slated for removal in v2.0.0. v3 returns no `next` cursor at all — there's no v3 equivalent. Use `fetchList.make` for both versions.

Reach for manual paging only when you genuinely need pauses, dynamic stop conditions, or custom backoff between pages on a v2 method that can't be expressed through `fetchList.make`. See [rest-api-v2](rest-api-v2.md) for the "Manual paging" recipe.

## Common pitfalls

- **Wrong `idKey` casing** — v2 default `'ID'`, v3 default `'id'`. For v2 `crm.item.*` (lowercase fields) explicitly pass `idKey: 'id'`.
- **Missing `customKeyForResult`** in v3 — required (no default). Forgetting it is caught by TypeScript at compile time.
- **Passing `order`** to `callList.make` / `fetchList.make` — silently ignored with a warning. Cursor pagination orders by `idKey`. Use `filter` to narrow.
- **`for ... of`** instead of `for await ... of` with `fetchList.make` — it's async.
- **Mixing filter shapes between versions** — v2 wants the operator-prefixed object form; v3 wants array-of-triples. Cross-pasting examples breaks silently (filter ignored = full list).
- **Using `callList.make` for 100 000+ rows** — heap explosion. Switch to `fetchList.make`.

See [rate-limiting](../guidelines/rate-limiting.md) for throttle tuning on long fetches.
