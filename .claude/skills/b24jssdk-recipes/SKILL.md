---
name: b24jssdk-recipes
description: End-to-end mini-apps built on b24jssdk — CRM analytics, ERP sync, Telegram bot, mass mailing, task automation, AI assistant, web search + LLM, Disk files, webhook handler. Each recipe is a self-contained TypeScript program using B24Hook on the server side. Load when the user asks for a working example or a starting template.
---

# b24jssdk recipes

Nine end-to-end programs adapted from the VibeCode docs to the b24jssdk SDK. Every recipe runs on `B24Hook` (Node.js), but the body of each function takes `$b24: TypeB24` so the same code works in-frame too — just swap the boot for `initializeB24Frame()`.

| # | File | Stack | Bitrix24 scopes | What it does |
|---|---|---|---|---|
| 1 | `examples/01-crm-analytics.ts` | Node | `crm` | Loads all deals, groups by stage, prints a funnel report (counts, conversion %, avg ticket, win rate) |
| 2 | `examples/02-mass-messaging.ts` | Node | `crm`, `im` | Filters contacts, personalises a template, sends IM notifications to assigned managers |
| 3 | `examples/03-task-automation.ts` | Node, `setInterval` | `crm`, `task` | Polls deal stages, creates a task on each watched stage transition |
| 4 | `examples/04-erp-sync.ts` | Node, `node-cron` | `crm` | Two-way sync of contacts between Bitrix24 and a mock ERP (replace with real API calls) |
| 5 | `examples/05-disk-files.ts` | Node | `disk` | Storages → root folder children → create subfolder → list/inspect files |
| 6 | `examples/06-telegram-bot.ts` | Node, `grammy`, `node-cron` | `crm` | Polls new deals, notifies a Telegram chat |
| 7 | `examples/07-webhook-handler.ts` | Node, `express` | `crm` | Receives Bitrix24 outbound events, fetches details via REST, dispatches handlers |
| 8 | `examples/08-ai-assistant.ts` | Node, `openai` | `crm`, `task` | For a given deal: pulls the timeline, asks GPT for a recommendation, creates a follow-up task |
| 9 | `examples/09-web-search-llm.ts` | Node, BYOC | none (uses your own LLM/search keys) | Two-step RAG: web search via your own provider, then LLM with `[N]` source citations |

## Boot snippet shared by all recipes

```ts
import { B24Hook, LoggerBrowser, type TypeB24 } from '@bitrix24/b24jssdk'

export function bootB24(): TypeB24 {
  const url = process.env.B24_HOOK
  if (!url) throw new Error('B24_HOOK env var is required (incoming webhook URL)')
  const $b24 = B24Hook.fromWebhookUrl(url)
  $b24.offClientSideWarning?.()
  return $b24
}

export const logger = LoggerBrowser.build('Recipe', process.env.NODE_ENV !== 'production')
```

The recipe files import `bootB24` and `logger` from this snippet. To keep each example file self-contained for copy-paste, the snippet is repeated at the top of every recipe.

## Field-naming choice

All recipes use the **v3** (`crm.item.*`) API where possible — camelCase fields like `stageId`, `assignedById`, `opportunity` — because that matches the field names in the original VibeCode docs and is the recommended path for new code. Where v3 doesn't cover the surface (tasks, disk, IM), classic methods are used and noted inline.

## Running

```bash
# 1. Install: at the repo root or in a fresh project
pnpm add @bitrix24/b24jssdk
# Recipe-specific deps as needed:
#   recipe 4: pnpm add node-cron
#   recipe 6: pnpm add grammy node-cron
#   recipe 7: pnpm add express
#   recipe 8: pnpm add openai

# 2. Set env
export B24_HOOK='https://YOUR_PORTAL.bitrix24.com/rest/1/k32t88gf3azpmwv3'

# 3. Run with tsx (no build step) or compile and run
npx tsx examples/01-crm-analytics.ts
```

## Caveats applied across recipes

- **Multi-funnel pipelines**: stage IDs may carry a category prefix (`C2:WON`, `C4:LOSE`). Recipes 1, 3, and 6 strip the prefix when checking the base stage.
- **Polling intervals**: 60 s for stage watcher, 2 min for new deals — adjust under high load and combine with `callListMethod` rather than `callMethod` loops.
- **Error handling**: AjaxError is logged but doesn't kill the loop; partial failures continue. Tune for your reliability target.
- **Webhook events** (recipe 7): registration of `event.bind` is a one-time setup not covered by these scripts — do it once via the portal admin or a manual `crm.event.bind` call.
