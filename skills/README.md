# b24jssdk skills

Project skills for the `@bitrix24/b24jssdk` workspace. Source of truth:
- `packages/jssdk/README-AI.md` — API-guide for callers
- `test/integration/js-docs/actions-v{2,3}.spec.ts` — canonical surface examples

## Skills

| Skill | When to use |
|---|---|
| **b24jssdk-core** | First skill to load. Picks the right entry point (B24Hook / B24Frame / B24OAuth), shows boot/teardown, error handling, hardErrorCodes/softErrorCodes/retryOnNetworkError tuning. |
| **b24jssdk-rest** | The canonical REST surface: `actions.v{2,3}.{call,batch,callList,fetchList,batchByChunk}.make()`. Picking between v2 and v3, AjaxResult shape, batch semantics. |
| **b24jssdk-filtering** | Two filter dialects — v2 prefix-keyed objects (`'>=createdTime'`) and v3 array-of-triples (`[['fld', '>=', v]]`). NOT, IN, dates via `Text.toB24Format`, the `order`-stripping rule of `callList`. |
| **b24jssdk-frame-ui** | UI managers available only inside Bitrix24 iframe: slider, dialog (`selectUser/Users/CRM/Access`), parent, placement (with `setValue`), options, auth. |
| **b24jssdk-helpers** | `useB24Helper`, `B24HelperManager`, Pull client, currency formatting, app/user options. |
| **b24jssdk-recipes** | Twelve end-to-end mini-apps (CRM analytics, ERP sync, Telegram bot, mass mailing, task automation, AI assistant, web search + LLM, Disk files, webhook handler, error-handling, event registration, OAuth install) — built on `actions.v{2,3}.*`. |
| **b24jssdk-vibecode** | How to use the SDK alongside the VibeCode HTTP API. Mostly: don't — keep them apart. The "AI add-on" pattern is the only sane mix. |

## Top-level docs

- `.github/contributing/maintenance.md` — rules for the weekly `docs/llms-full.txt` review.
- `.github/contributing/report.md` — open questions, conspectus of doubtful bits, migration log.
- `.github/contributing/suggested-examples.md` — gaps in the current example set, ranked by ROI.

## Conventions used inside every skill

- TypeScript / ESM. Bare imports from `@bitrix24/b24jssdk`.
- The active client is always `$b24` and is treated as `TypeB24` — every example works for `B24Hook`, `B24Frame`, and `B24OAuth` because the actions surface lives on `AbstractB24`.
- Always use **`$b24.actions.v{2,3}.*.make()`** — the legacy `callMethod`/`callBatch`/`callListMethod`/`fetchListMethod` is `@deprecated` for 2.1.0.
- The SDK has no hardcoded v3 allowlist any more — `actions.v3.*` sends any method to the v3 endpoint and the server validates it (unknown → `METHODNOTFOUNDEXCEPTION`). Default to `v2`; use `v3` when you want a method's v3 representation (`tasks.task.*`, `main.eventlog.*`, `note.*`, `rest.application.*`, …).
- v3 entities (`crm.item.*`) on v2 still need `idKey: 'id'` (lowercase) and `customKeyForResult: 'items'` for list helpers; classic methods (`crm.deal.*`) use default `idKey: 'ID'`. `tasks.task.list` differs by endpoint: on **v2** it sorts / filters by `ID` but returns lowercase `id`, so it needs `idKey: 'id', cursorIdKey: 'ID'` (and `customKeyForResult: 'tasks'`); on **v3** it is all-lowercase — `idKey: 'id'` (default), no `cursorIdKey`, `customKeyForResult: 'items'`.
- Filters: v2 = prefix-keyed object; v3 = array of `[field, op, value]` triples. Never mix.
- Dates: use `Text.toB24Format(date)` for the canonical `yyyy-MM-dd'T'HH:mm:ssZZ` format.

## Migration note

This skill set was rewritten in 2026-05 to move off the deprecated SDK surface. If you find examples in the wider repo (docs/, playgrounds/) still using `b24.callMethod(...)`, that's the old form — feel free to surface it for migration. The new form is `b24.actions.v{2,3}.call.make({ method, params, requestId? })`.
