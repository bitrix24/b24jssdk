# b24jssdk skills

Project skills for the `@bitrix24/b24jssdk` workspace. Source of truth: `packages/jssdk/README-AI.md` + integration tests under `test/integration/`.

## Skills

| Skill | When to use |
|---|---|
| **b24jssdk-core** | First skill to load. Picks the right entry point (B24Hook / B24Frame / B24OAuth), shows boot/teardown, error handling, logger setup. |
| **b24jssdk-rest** | Calling REST: `callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`. Choosing a list strategy. |
| **b24jssdk-filtering** | Bitrix24 filter syntax (prefix-based: `>=`, `<=`, `!`, `%`, `=%`), NOT, dates, sort, manual pagination. |
| **b24jssdk-frame-ui** | UI managers available only inside Bitrix24 iframe: sliders, dialogs, parent window, placement, options. |
| **b24jssdk-helpers** | `useB24Helper`, `B24HelperManager`, Pull client, currency formatting, app/user options. |
| **b24jssdk-recipes** | Nine end-to-end mini-apps (CRM analytics, ERP sync, Telegram bot, mass mailing, task automation, AI assistant, web search + LLM, Disk files, webhook handler) — adapted to the SDK style. |
| **b24jssdk-vibecode** | How to use the SDK alongside the VibeCode HTTP API. Mostly: don't — keep them apart. |

## Top-level docs

- `MAINTENANCE.md` — rules for the weekly `docs/llms-full.txt` review.
- `REPORT.md` — open questions, conspectus of doubtful bits, mapping caveats.
- `SUGGESTED-EXAMPLES.md` — gaps in the current example set, ranked by ROI.

## Conventions used inside every skill

- TypeScript / ESM. Bare imports from `@bitrix24/b24jssdk`.
- The active client is always `$b24` and is treated as `TypeB24` — every example works for `B24Hook`, `B24Frame`, and `B24OAuth` because `callMethod / callBatch / callListMethod / fetchListMethod` live on `AbstractB24`.
- v3 entities (`crm.item.*`) use `EnumCrmEntityTypeId` and the customKey `'items'` for list calls; classic methods (`crm.deal.*`, `tasks.task.*`) use the default `'result'` key.
- Filters are written in **Bitrix24 prefix** style — never MongoDB-style `$gt/$gte/$ne` (that is VibeCode-only).
