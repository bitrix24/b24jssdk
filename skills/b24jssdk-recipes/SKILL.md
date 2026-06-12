---
name: b24jssdk-recipes
description: End-to-end mini-apps built on the canonical b24jssdk actions.v{2,3}.* surface — CRM analytics, ERP sync, Telegram bot, mass mailing, task automation, AI assistant, web search + LLM, Disk files, webhook handler, error-handling cookbook, event registration, OAuth install handshake. Each recipe is a self-contained TypeScript program using B24Hook on the server side. Load when the user asks for a working example or a starting template.
---

# b24jssdk recipes

Twelve end-to-end programs. Every recipe runs on `B24Hook` (Node.js), but each function body takes `$b24: TypeB24` so the same code works in-frame too — just swap the boot for `initializeB24Frame()`.

All recipes use the canonical **`$b24.actions.v{2,3}.*.make()`** surface. The legacy `callMethod` / `callBatch` / `callListMethod` / `fetchListMethod` is `@deprecated` for 2.0.0 — do not generate code against it.

| # | File | Stack | Scopes | What it does |
|---|---|---|---|---|
| 1 | `examples/01-crm-analytics.ts` | Node | `crm` | Stream all deals via `actions.v2.fetchList.make`, group by stage, print a funnel report (counts, conversion %, avg ticket, win rate) |
| 2 | `examples/02-mass-messaging.ts` | Node | `crm`, `im` | Filter contacts via `actions.v2.call.make`, send `im.notify` to assigned managers |
| 3 | `examples/03-task-automation.ts` | Node, `setInterval` | `crm`, `task` | Poll deal stages with `actions.v2.fetchList.make`; on watched transition create a task via `actions.v3.call.make('tasks.task.add', …)` |
| 4 | `examples/04-erp-sync.ts` | Node, `node-cron` | `crm` | Two-way contact sync between Bitrix24 (via `actions.v2.*`) and a mock ERP |
| 5 | `examples/05-disk-files.ts` | Node | `disk` | Storages → root → create folder → list files, with a `actions.v2.batch.make` round-trip |
| 6 | `examples/06-telegram-bot.ts` | Node, `grammy`, `node-cron` | `crm` | Poll new deals via `actions.v2.call.make`, notify a Telegram chat |
| 7 | `examples/07-webhook-handler.ts` | Node, `express` | `crm` | Express server that receives Bitrix24 outbound events; loads details with `actions.v2.call.make` |
| 8 | `examples/08-ai-assistant.ts` | Node, `openai` | `crm`, `task` | Deal + activity timeline → GPT prompt → `actions.v3.call.make('tasks.task.add')` follow-up |
| 9 | `examples/09-web-search-llm.ts` | Node, BYOC | `crm` | Two-step RAG; SDK posts the answer to a deal's timeline via `actions.v2.call.make('crm.timeline.comment.add')` |
| 10 | `examples/10-error-handling.ts` | Node | any | Error-handling cookbook: AjaxError vs SdkError taxonomy; `hardErrorCodes` / `softErrorCodes` / `retryOnNetworkError` knobs via `setRestrictionManagerParams`; non-idempotent-call safety |
| 11 | `examples/11-event-registration.ts` | Node | `crm` | CLI tool — list / bind / unbind outbound webhook events (`event.get`, `event.bind`, `event.unbind`). Pairs with recipe 7. |
| 12 | `examples/12-oauth-install.ts` | Node, `express` | OAuth app | OAuth install handshake: handle `ONAPPINSTALL` / `ONAPPUPDATE` / `ONAPPUNINSTALL` events, persist tokens per portal, build `B24OAuth` on demand, refresh callback writes new tokens back to storage |

## Shared library (`lib/`)

Pure, I/O-free helpers extracted from recipes so they can be unit-tested without a live portal.

| File | Exports | Used by |
|---|---|---|
| `lib/funnel.ts` | `baseStage`, `analyseFunnel`, `DealRow`, `StageStat` | recipe 01 |

`baseStage(s)` strips the multi-funnel category prefix (`"C2:WON"` → `"WON"`).  
`analyseFunnel(deals)` groups deals by raw `stageId` key, summing counts and opportunity amounts.

## Boot snippet (shared by all recipes)

```ts
import { B24Hook, LoggerBrowser, type TypeB24 } from '@bitrix24/b24jssdk'

export function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required (incoming webhook URL)')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning()
  return $b24
}

export const logger = LoggerBrowser.build('Recipe', process.env.NODE_ENV !== 'production')
```

The snippet is inlined into each recipe file for copy-paste convenience.

## API-version split — quick reference

Inside the recipes the split is:

| Method | Action surface | Why |
|---|---|---|
| `crm.item.{get,list,add,update,delete}` | `actions.v2.*` | Not in the v3 whitelist (see `version-manager.ts`) |
| `crm.activity.list`, `crm.timeline.comment.add` | `actions.v2.*` | Classic API, v2 only |
| `tasks.task.{add,get,update,delete}` | **`actions.v3.*`** | On the v3 whitelist |
| `tasks.task.list` | `actions.v2.*` | Not yet on the v3 whitelist |
| `disk.*`, `im.*`, `profile`, `user.*` | `actions.v2.*` | Classic API, v2 only |
| `main.eventlog.{list,get,tail}` | **`actions.v3.*`** | On the v3 whitelist |

> Calling a v3-eligible method through `actions.v2.*` works but logs `JSSDK_CORE_METHOD_AVAILABLE_IN_API_V3`. Calling a non-v3 method through `actions.v3.*` throws `SdkError(JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3)`.

## Field-naming choice

CRM v3-style methods (`crm.item.list`) use camelCase fields: `stageId`, `assignedById`, `opportunity`, `createdTime`. Classic methods (`tasks.task.add`, `crm.activity.list`, `crm.timeline.comment.add`) use uppercase: `TITLE`, `DESCRIPTION`, `OWNER_TYPE_ID`. Recipes follow this split.

## Running

```bash
# 1. Install: at the repo root or in a fresh project
pnpm add @bitrix24/b24jssdk
# Recipe-specific deps as needed:
#   recipe 4: pnpm add node-cron
#   recipe 6: pnpm add grammy node-cron
#   recipe 7: pnpm add express
#   recipe 8: pnpm add openai
#   recipe 9: pnpm add openai
#   recipe 12: pnpm add express

# 2. Set env
export B24_HOOK='https://YOUR_PORTAL.bitrix24.com/rest/1/k32t88gf3azpmwv3'

# 3. Run with tsx (no build step)
npx tsx examples/01-crm-analytics.ts
```

## Caveats applied across recipes

- **Multi-funnel pipelines**: stage IDs may carry a category prefix (`C2:WON`, `C4:LOSE`). Recipes 1, 3, and 6 strip the prefix when checking the base stage.
- **`order` in `callList.make`**: silently dropped (the action forces `cursorIdKey ASC`, defaulting to `idKey`, for cursor stability). Use `filter` to narrow.
- **`customKeyForResult`**: `'items'` for `crm.item.list`, omit or `'tasks'` for classic methods. Wrong value → silent empty array.
- **`idKey` / `cursorIdKey`**: `idKey: 'id'` for `crm.item.list`; `'ID'` (default) for classic methods. `tasks.task.list` is the exception — it returns lowercase `id` but sorts by `ID`, so use `idKey: 'id', cursorIdKey: 'ID'`.
- **Error handling**: failed calls throw `AjaxError` for REST errors; recipes log and continue where it makes sense. Tune via `setRestrictionManagerParams` if you need different retry behaviour (see `b24jssdk-core`).
- **Webhook events** (recipe 7): registration of the outbound webhooks themselves (which events go where) is a one-off setup. Recipe 11 (`11-event-registration.ts`) is a small CLI for that: `list` / `bind` / `unbind` via `event.get` / `event.bind` / `event.unbind`.

## Cross-reference

For v3 wire-level details (filter grammar, aggregate functions, batch `$ref`/`$refArray`, cursor pagination), use the `b24jssdk-rest` and `b24jssdk-filtering` skills.
