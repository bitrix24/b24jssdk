---
name: b24jssdk-vibecode
description: How to combine the b24jssdk SDK with the VibeCode HTTP API (vibecode.bitrix24.tech). Most teams should NOT mix the two — pick one. This skill explains why, where they overlap, and the only practical pattern when you need both. Load only when the user explicitly mentions VibeCode.
---

# b24jssdk × VibeCode

VibeCode (`https://vibecode.bitrix24.tech`) is a **separate HTTP service** built on top of Bitrix24 REST. It exposes a JSON Entity API (`/v1/deals`, `/v1/contacts`, …), an AI Router (`/v1/ai/chat/completions`), web search (`/v1/search`), and an "infrastructure" API for hosted deployments. It is **not** Bitrix24 REST.

`@bitrix24/b24jssdk` is a thin TypeScript wrapper around **Bitrix24 REST itself**. The two products solve different problems and use different transports.

## Decision matrix

| You want to… | Use |
|---|---|
| Read/write Bitrix24 entities (CRM, tasks, disk, IM) from a server or in-frame app | **b24jssdk** (`B24Hook`/`B24Frame`/`B24OAuth`) |
| Have an LLM bootstrap an app on top of Bitrix24 with its own keys (`vibe_api_…`/`vibe_app_…`) | **VibeCode** directly (no SDK) |
| Use Bitrix24's hosted AI Router or web-search proxy | **VibeCode** directly |
| Run on a VibeCode-managed server *and* still read/write Bitrix24 normally | **VibeCode key for AI/search + b24jssdk for Bitrix24** |

Default to b24jssdk for anything Bitrix24-shaped. Reach for VibeCode only when you specifically need AI Router, web search, or VibeCode's infra.

## Why not mix the two for entity calls

The Entity API field names and filter dialect differ from Bitrix24 REST:

| Bitrix24 (b24jssdk) | VibeCode |
|---|---|
| `actions.v2.callList.make({ method: 'crm.item.list', params: { filter: { '>=opportunity': 50000 } } })` | `POST /v1/deals/search` body `{ "amount": { "$gte": 50000 } }` |
| Filter operators: `>=`, `<=`, `!`, `%`, `=%` (v2) or `[['fld','>=','v']]` (v3) | MongoDB-style: `$gte`, `$lte`, `$ne`, `$contains`, `$in` |
| `phone: [{ VALUE, VALUE_TYPE }]` (multi-value) | `phone: "+7..."` (often single string) |
| `STAGE_ID` / `stageId` (depends on method version) | always camelCase |
| Auth: webhook secret in URL or OAuth tokens | Auth: `X-Api-Key: vibe_api_…` |

Translating a working b24jssdk query into a VibeCode body requires **rewriting** the operator syntax and field names. It's not a free swap. Picking one keeps your code consistent.

## The "AI add-on" pattern (VibeCode just for AI)

If your portal has a `vibe_api_…` key and you only want AI Router or Web Search, keep b24jssdk for Bitrix24 and call VibeCode endpoints with plain `fetch`:

```ts
import {
  B24Hook,
  EnumCrmEntityTypeId,
  type TypeB24
} from '@bitrix24/b24jssdk'

const $b24: TypeB24 = B24Hook.fromWebhookUrl(process.env.B24_HOOK!)
$b24.offClientSideWarning?.()

// 1. Read a deal via b24jssdk (Bitrix24 REST)
const dealRes = await $b24.actions.v2.call.make<{ item: { id: number; title: string } }>({
  method: 'crm.item.get',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    id: 42
  }
})
if (!dealRes.isSuccess) throw new Error(dealRes.getErrorMessages().join('; '))
const deal = dealRes.getData()!.result.item

// 2. Ask the VibeCode AI Router (HTTP, no SDK)
const aiRes = await fetch('https://vibecode.bitrix24.tech/v1/ai/chat/completions', {
  method: 'POST',
  headers: {
    'X-Api-Key': process.env.VIBE_API_KEY!,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'bitrix/bitrixgpt-5',
    messages: [{ role: 'user', content: `Suggest a follow-up for: ${deal.title}` }]
  })
})
const ai = await aiRes.json()
const advice = ai.choices[0].message.content as string

// 3. Write the result back via b24jssdk
await $b24.actions.v2.call.make({
  method: 'crm.timeline.comment.add',
  params: {
    fields: { ENTITY_ID: 42, ENTITY_TYPE: 'deal', COMMENT: `[AI] ${advice}` }
  }
})
```

That's all there is to it: VibeCode for AI/search, b24jssdk for everything Bitrix24-shaped. No SDK extension is needed; do not try to teach `B24Hook` how to talk to `/v1/...`.

## Anti-patterns

- ❌ Loading `vibe_api_…` into `B24Hook.fromWebhookUrl()` — it expects a Bitrix24 webhook URL, not a VibeCode key.
- ❌ Passing MongoDB-style filters (`$gt`, `$lt`, `$ne`, `$contains`) to `actions.v{2,3}.*.make` — Bitrix24 REST does not understand them and returns 400 (v3) or returns wrong rows (v2 ignores unknown operators).
- ❌ Calling `/v1/deals/search` from in-frame code and then calling `crm.item.list` for the same deals "for consistency". Pick one source.
- ❌ Storing a VibeCode key in `B24Frame.options.appSet` — placement options are visible to all users with access to the placement.

## When users say "VibeCode" but mean "Bitrix24"

VibeCode docs sometimes refer to Bitrix24 REST methods (e.g., `tasks.task.add`) and sometimes to their own Entity API endpoints (e.g., `POST /v1/tasks`). Disambiguate before generating code:

- If the example imports `'@bitrix24/b24jssdk'` or talks about `B24Hook` / `B24Frame` / `B24OAuth` — use the SDK.
- If the example uses `fetch('https://vibecode.bitrix24.tech/v1/...')` with `X-Api-Key` — that's VibeCode.

When in doubt, ask the user which side they want to live on.
