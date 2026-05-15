# Report — skill set after the 2026-05 migration

This file captures the state of the skill set after migrating off the deprecated SDK surface, plus the open questions the user should be aware of.

## Migration log (2026-05)

Trigger: rebasing the `claude/extract-sdk-examples-7HE3n` branch onto `main@1.1.1` surfaced a `Deprecation notice` in `packages/jssdk/README-AI.md`. The entire `callMethod` / `callBatch` / `callBatchByChunk` / `callListMethod` / `fetchListMethod` surface, plus `AjaxResult.isMore() / getNext() / getTotal()`, is `@deprecated` and scheduled for removal in **`2.0.0`**.

Files migrated to `$b24.actions.v{2,3}.*.make()`:

- `b24jssdk-rest/SKILL.md` — complete rewrite. Covers `call`, `batch`, `callList`, `fetchList`, `batchByChunk` for both API versions; AjaxResult new shape; v3 all-or-nothing batch; null-result passthrough.
- `b24jssdk-filtering/SKILL.md` — added the v3 array-of-triples dialect alongside the existing v2 prefix dialect. Added the rule that `callList`/`fetchList` strip user-supplied `order`.
- `b24jssdk-core/SKILL.md` — added `hardErrorCodes` / `softErrorCodes` / `retryOnNetworkError` tuning. Updated examples to the new surface.
- `b24jssdk-frame-ui/SKILL.md` — un-deprecated `selectCRM` (it's actively maintained now and normalizes response buckets); added `placement.setValue` helper.
- `b24jssdk-helpers/SKILL.md` — corrected `usePullClient()` to be arg-less; mentioned new `isInitB24Helper()` getter.
- `b24jssdk-recipes/SKILL.md` + 9 recipe `.ts` files — all rewritten on the new surface. CRM → `actions.v2.*`, tasks → `actions.v3.*` where on the whitelist (`tasks.task.add/get/update/delete`).
- `b24jssdk-vibecode/SKILL.md` — AI-add-on example updated to new API.
- `README.md` + `MAINTENANCE.md` — translation tables now use `actions.v{2,3}.*.make`.

## Anchor facts (verified against current SDK source)

These are the load-bearing facts that the skills rely on. If a future audit finds one of them changed, the related skill needs revision.

| Fact | Source |
|---|---|
| v3-supported method whitelist (only ~9 methods today) | `packages/jssdk/src/core/version-manager.ts:21-44` |
| `actions.v{2,3}.call.make` returns `Promise<AjaxResult<T>>`; access with `res.getData()!.result.<key>` | `core/actions/v{2,3}/call.ts`, `test/integration/js-docs/actions-v{2,3}.spec.ts` |
| `actions.v{2,3}.callList.make` strips user-supplied `order` and forces `{ [idKey]: 'ASC' }` | `core/actions/v2/call-list.ts:77-87`, v3 equivalent at `core/actions/v3/call-list.ts:77-87` |
| Default `idKey` is `'ID'` for v2 (uppercase), `'id'` for v3 (lowercase) | `core/actions/v2/call-list.ts:72`, `core/actions/v3/call-list.ts:72` |
| `crm.item.list` is v2, response is `{ items: [...] }` → needs `customKeyForResult: 'items'` + `idKey: 'id'` | `test/integration/js-docs/actions-v2.spec.ts:41-65` |
| `tasks.task.add/get/update/delete` are v3 | `core/version-manager.ts:34-37` |
| v3 filter dialect: array of `[field, op, value]` or `[field, value]` triples; 8 operators only (`=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `between`); no `like`/`%` | `.claude/bitrix24-rest-v3-reference.md:111-160` |
| v2 filter dialect: prefix-keyed object — `'>=createdTime'`, `'!stageId'`, `'%title'`, `'=%title'` | `test/integration/js-docs/actions-v2.spec.ts:46-49`, `core/actions/v2/call-list.ts:81-86` |
| Date format: `Text.toB24Format(date)` → `yyyy-MM-dd'T'HH:mm:ssZZ` | `tools/text.ts:213-226` |
| `AjaxResult.getData()` returns `SuccessPayload<T> \| undefined` = `{ result, time } \| undefined` | `types/payloads.ts:68-82`, `core/http/ajax-result.ts:61-72` |
| v3 batch is all-or-nothing (no per-command errors) | `README-AI.md` "Limitations", `core/actions/v3/batch.ts` |
| Per-command `result` in batch can legitimately be `null` (issue #23) | `README-AI.md` "Patterns" |
| `hardErrorCodes` / `softErrorCodes` / `retryOnNetworkError` available via `setRestrictionManagerParams` | `types/limiters.ts:90-147` |
| `placement.setValue(value)` auto-serializes; `placement.call('setValue', { value })` requires `value` already stringified | `frame/placement.ts:104-151` |
| `dialog.selectCRM()` is NOT deprecated — re-implemented to normalize buckets to real arrays | `frame/dialog.ts:175-235` |

## Open questions / unresolved

### 1. v3 method whitelist will grow — when do we re-balance recipes?
Today only `tasks.task.{add,get,update,delete,…}` and `main.eventlog.*` are on v3. The whitelist is owned by Bitrix24 and will expand. When `crm.item.list` arrives on v3, several recipes (1, 3, 4, 6, 7, 9) should be moved to `actions.v3.*` — but the **filter dialect changes from prefix-keyed to array-of-triples** at the same time. That's a meaningful rewrite, not a renaming.

Action item for the next weekly review: grep `version-manager.ts:#supportMethods` for new entries.

### 2. Aggregate action (`actions.v3.aggregate`) not exposed in the SDK yet
The v3 protocol supports `aggregate` (`avg`/`sum`/`min`/`max`/`count`/`countDistinct`, per `.claude/bitrix24-rest-v3-reference.md:304-368`). The SDK currently does not expose a typed `aggregate.make` action. Recipe 1 (CRM analytics) loads all deals into memory and aggregates client-side — when an `aggregate` action lands, the recipe becomes a one-call query.

### 3. `B24OAuth` install handshake still uncovered
The skills assume the user already has `authParams` populated from install events. The full OAuth install round-trip (Express endpoint that handles `ONAPPINSTALL`, persists tokens, swaps refresh on schedule) isn't a recipe yet — biggest blocker for anyone shipping a Marketplace app. Highest-ROI gap.

### 4. Recipe 7 (webhook handler) payload shape still unverified
Bitrix24 outbound webhooks POST `application/x-www-form-urlencoded`. The recipe relies on `express.urlencoded({ extended: true })` to parse `data[FIELDS][ID]` into a nested object. Confirmed by reading the Express docs, but **not yet run against a live portal**. If `payload.data?.FIELDS?.ID` arrives empty, that's where to look.

### 5. Recipe 9 (timeline comment) ENTITY_TYPE shape
`crm.timeline.comment.add` accepts both `ENTITY_TYPE: 'deal'` (string) and `ENTITY_TYPE_ID: 2` (int). Recipe uses the string form. **Untested on a live portal** — if it 400s, swap to `ENTITY_TYPE_ID: EnumCrmEntityTypeId.deal`.

### 6. Multi-funnel filtering for v2 array-IN
The recipes filter `'!stageId': ['WON', 'LOSE']` — v2 syntax. On multi-funnel portals there's also `C2:WON`, `C4:LOSE`, etc. Each recipe that touches stages also runs a client-side `baseStage(s)` re-filter as belt-and-suspenders. Not pretty but defensive.

### 7. `placement.setValue` semantics
The skill describes it correctly for the documented "select-value" placement case. Whether it works for other placement types isn't clear from the source comments — there's just the `setValue` command name and a JSON.parse-on-receipt rule. Treat as out-of-scope until needed.

## Items deliberately NOT extracted from llms-full.txt

- Per-endpoint reference pages (`# Bot: …`, `# Entity: …`) — auto-generated, duplicate apidocs.
- VibeCode's deploy / infra / Black Hole / preview-token sections — irrelevant to SDK.
- MCP-for-AI section — VibeCode-only.
- `Менеджмент-ключи`, `Partner Connect` — VibeCode platform-internal.
- The `aggregate` action protocol details — already covered in `.claude/bitrix24-rest-v3-reference.md`.

## What's likely to break first (rank-ordered)

1. **Skills referencing `b24.callMethod(...)` after the 2.0.0 release.** Mitigated: all skills now use the actions surface. Search for any leftover `callMethod` / `callBatch` / `callListMethod` / `fetchListMethod` in skill files — should return zero results.
2. **`customKeyForResult: 'result'` typo for `crm.item.list`.** Silent empty arrays. Skill explicitly calls this out.
3. **Passing `order` to `callList.make`.** Silently dropped with a warning. Skill explicitly calls this out.
4. **v2 prefix filter inside `actions.v3.*`.** Throws `UnknownFilterOperatorException`. Skill explicitly calls this out, but a copy-paste from a v2 example into a v3 call is plausible.
5. **`crm.item.list` filter using uppercase field names (`STAGE_ID`).** Silently returns wrong data — the v3-style methods need lowercase. The skill's field-naming table covers this but the failure mode is silent, so worth re-emphasising in code review.

## How to verify the skills locally

After any future edit:

```bash
# 1. Lint everything
pnpm run lint

# 2. Typecheck workspace
pnpm run typecheck

# 3. (Optional, requires .env.test) — run the canonical actions specs
pnpm vitest run -t "js-docs.actions" --project jsSdk:integration
```

The lint config ignores `.claude/**` (see `eslint.config.mjs`), so changes to skill files won't trip the linter. That's intentional — these are agent-facing examples, not workspace source.
