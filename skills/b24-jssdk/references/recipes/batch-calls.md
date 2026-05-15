# Batch calls — decision page

When and which batch shape to use. Code examples live in the version-specific recipes:

- **v2 examples:** [rest-api-v2 → Batch](rest-api-v2.md#batch--batchmake), [BatchByChunk](rest-api-v2.md#auto-chunked-batch--batchbychunkmake)
- **v3 examples:** [rest-api-v3 → Batch](rest-api-v3.md#batch--batchmake), [BatchByChunk](rest-api-v3.md#auto-chunked-batch--batchbychunkmake)

## When to batch at all

| Need | Action |
|---|---|
| Single REST call | `call.make` (not `batch.make` with one item) |
| 2 – 50 related calls in one round-trip | `batch.make` |
| > 50 calls, or unknown / dynamic length | `batchByChunk.make` |
| All rows of one list method | `callList.make` / `fetchList.make`, not batch — see [list-pagination](list-pagination.md) |

## v2 vs v3 batching — both directions exist

`b24.actions.v2.batch.make` and `b24.actions.v3.batch.make` are independent endpoints, not a v3-replacement-for-v2. Pick the version that matches the methods you're calling:

- All commands are v2 methods → `v2.batch.make`. This is most batches today (CRM, IM, user, options, …).
- All commands are v3-supported (`tasks.task.*`, `main.eventlog.*`, meta endpoints) → `v3.batch.make`.
- Mix of v2-only and v3 in the same group → **not allowed in one batch.** Split into two `batch.make` calls (one per version), or downgrade everything to v2 if the v3 methods also exist there.

`b24.actions.v3.batch.make` throws `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` at call time if any one command isn't v3-supported. See [rest-api-v3 → When to use](rest-api-v3.md#when-to-use-v3--and-when-not-to) for the current v3 method list.

## Input shapes

All three shapes work in both v2 and v3 `batch.make` (only the named-object shape is unsupported by `batchByChunk.make`):

- **Array of tuples** — `[[method, params], ...]`. Compact; best for homogeneous lists.
- **Array of objects** — `[{ method, params }, ...]`. Same as tuples, more readable.
- **Named object** — `{ Name: { method, params }, ... }`. Results keyed by the names you choose; best when the consumer code wants to address results by name.

Pick whichever makes the consumer code clearest. See [rest-api-v2 → Batch](rest-api-v2.md#batch--batchmake) for a code sample of each.

## `isHaltOnError`

| Value | Behaviour |
|---|---|
| `true` (default) | Reject on first failing command. Use for transactional groups |
| `false` | Resolve; per-command errors accumulate on the returned `Result` (`response.errors`, `response.getErrorMessages()`). v2 only — v3 batches are all-or-nothing regardless |

## `returnAjaxResult`

- `false` (default) — `response.getData()` returns flat data per command.
- `true` — each value is an `AjaxResult` so you can call `isSuccess`, `getData`, etc. per command. Useful when individual commands return paginated results.
- **Not supported by `batchByChunk.make`** — it forces `false` and flattens output to `T[]`.

## Anti-patterns

- Wrapping one call in `batch.make` — overhead with no benefit. Use `call.make`.
- Hand-rolling 50-command chunking around `batch.make` — `batchByChunk.make` already does this.
- Mixing v2-only and v3 methods inside one `v3.batch.make` — throws. Split or downgrade.
- Both `isHaltOnError: true` *and* a `try/catch` for partial recovery — pick one strategy.
- Using a named-object shape with `batchByChunk.make` — not supported (chunks can't preserve named keys reliably).
