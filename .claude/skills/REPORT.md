# Report — initial pass on `docs/llms-full.txt` (2026-05-05 generation)

This is the conspectus the user asked for: open questions, decisions made under uncertainty, and items that still need a human call before they can become canonical examples.

## Source headline numbers

- 42 622 lines, ~1.4 MB, 1 721 fenced code blocks (699 bash, 532 json, 433 javascript, 3 php, 3 js, 2 python, 1 powershell, 1 toml).
- 416 top-level (`# `) sections; 9 self-contained recipes (`^# Recipe:`).
- The whole file documents **VibeCode** (`vibecode.bitrix24.tech`), an HTTP wrapper / proxy on top of Bitrix24 REST. It is not the b24jssdk SDK. The user asked to adapt the examples into our library's idioms — that's what every recipe in `b24jssdk-recipes/examples/` does.

## Decisions taken under ambiguity (worth confirming)

### 1. v3 (`crm.item.*`) over classic methods for new code
The original VibeCode docs use camelCase fields (`stageId`, `assignedById`, `opportunity`). Classic Bitrix24 REST methods (`crm.deal.list`) use uppercase (`STAGE_ID`, `ASSIGNED_BY_ID`, `OPPORTUNITY`). Translating field-by-field would invert all examples. I kept VibeCode's field naming by using `crm.item.list` + `entityTypeId` everywhere CRM appears.

**Open**: do you also want a parallel set of "classic" examples? They're more familiar to long-time Bitrix24 developers and avoid the `entityTypeId` boilerplate. Right now classic only appears for tasks (`tasks.task.*`), disk (`disk.*`), IM (`im.notify`, `crm.timeline.comment.add`), where v3 isn't available.

### 2. Multi-funnel pipelines
On portals with multiple funnels, stage IDs come prefixed: `C2:NEW`, `C4:WON`. The original VibeCode docs had a `get_stage_name()` helper for this in recipe 1. I propagated that pattern (a `baseStage()` helper) to every recipe that touches stages — recipes 1, 3, 6.

**Open**: I'm assuming the user has at least one extra funnel. If their portal has only the default funnel, the helper is harmless but adds noise. If they want, drop it.

### 3. Filter syntax — only Bitrix24 prefix style in skills
VibeCode allows three filter syntaxes:
- MongoDB-style (`$gt`, `$ne`, `$contains`)
- Bitrix24 prefix (`>=`, `!`, `%`) ← THIS one is what real Bitrix24 REST uses
- Bitrix24 operator-keys (`{">=": 50000}`)

Only the second one is actually understood by Bitrix24 REST. The other two are VibeCode-server-side conveniences. **The b24jssdk-filtering skill documents prefix-only.** Anything else would silently 400 against a real portal.

### 4. `B24OAuth` boot snippet
The README-AI.md says `// b24OAuthParams come from the install/refresh events` but doesn't show how to wire that. I wrote the skill assuming the user already persists those tokens (the install handler is out of scope for the SDK). If the user wants a recipe for "registering an OAuth app and surviving the first install round-trip", that's a real gap — see `SUGGESTED-EXAMPLES.md`.

### 5. Recipe 9 (web search + LLM)
This recipe in the original docs uses VibeCode's AI Router (`/v1/ai/chat/completions`) and Bitrix-search (`/v1/search`). Neither is in Bitrix24 REST. I rewrote the recipe so the search/LLM step is BYOC (bring your own credentials — the comments point at Tavily/Brave/SerpAPI/OpenAI), and the b24jssdk part posts the LLM answer back to a deal's timeline. That keeps the example useful for SDK users, but it's no longer a 1:1 port.

**Open**: do you want to add a `b24jssdk-vibecode-aux/` skill that wraps the actual VibeCode AI Router calls behind a tiny helper? The `b24jssdk-vibecode` skill currently says "use plain fetch" for those endpoints.

### 6. Recipe 7 (webhook handler) — payload shape
VibeCode's recipe assumed the webhook body shape `{ event, data: { FIELDS: {...} } }`. Bitrix24 outbound webhooks **actually** post `application/x-www-form-urlencoded` with keys like `event`, `data[FIELDS][ID]`, `auth[…]`. The Express body parser flattens form-encoded brackets into nested objects, so the shape should match — but the request `Content-Type` is `x-www-form-urlencoded`, not `application/json`. I kept both `express.json()` and `express.urlencoded({extended:true})` in the recipe.

**Open**: untested against a real portal. If you have an outbound webhook to spare, run recipe 7 and report whether `payload.data?.FIELDS?.ID` arrives populated.

### 7. `crm.timeline.comment.add` field shape (recipe 9)
I used `ENTITY_TYPE: 'deal'` (string). Some Bitrix24 portals expect `ENTITY_TYPE: 'deal'`, others want the integer `ENTITY_TYPE_ID: 2`. The docs are inconsistent. **Untested** — if it 400s, swap to `{ ENTITY_TYPE_ID: EnumCrmEntityTypeId.deal }`.

## Things I deliberately did NOT extract from llms-full.txt

- The full per-endpoint reference pages (`# Bot: …`, `# Entity: …` between lines 10900–40800). They duplicate what the user can already get from the Bitrix24 apidocs. Bringing them into the skills bloats them with little value.
- VibeCode's deploy / infra / Black Hole / preview-token sections (lines 3036–3548). Nothing in there maps to the SDK.
- The MCP-for-AI section. Useful for VibeCode users, irrelevant for SDK callers.
- The `Менеджмент-ключи` and `Partner Connect` sections. Same reason.

## Translation table (also lives in MAINTENANCE.md)

| VibeCode HTTP API | b24jssdk |
|---|---|
| `GET /v1/deals/:id` | `callMethod('crm.item.get', { entityTypeId: 2, id })` |
| `POST /v1/deals/search` body `{ filter, sort, limit }` | `callMethod('crm.item.list', { entityTypeId: 2, filter, order })` (or `callListMethod` / `fetchListMethod`) |
| `POST /v1/deals` body `{ ... }` | `callMethod('crm.item.add', { entityTypeId: 2, fields: { ... } })` |
| `PATCH /v1/deals/:id` body `{ ... }` | `callMethod('crm.item.update', { entityTypeId: 2, id, fields: { ... } })` |
| `DELETE /v1/deals/:id` | `callMethod('crm.item.delete', { entityTypeId: 2, id })` |
| `POST /v1/contacts/search` | `callMethod('crm.item.list', { entityTypeId: 3, filter, order })` |
| `POST /v1/tasks` | `callMethod('tasks.task.add', { fields: { TITLE, RESPONSIBLE_ID, … } })` |
| `POST /v1/notifications` body `{ userId, message }` | `callMethod('im.notify', { to, message, type: 'SYSTEM' })` |
| `GET /v1/storages` | `callMethod('disk.storage.getlist')` |
| `GET /v1/folders?filter[parentId]=N` | `callMethod('disk.folder.getchildren', { id: N })` |
| `POST /v1/folders` `{ parentId, name }` | `callMethod('disk.folder.addsubfolder', { id, data: { NAME } })` |
| `GET /v1/files/:id` | `callMethod('disk.file.get', { id })` |
| `POST /v1/batch` (entity-style calls) | `callBatch({ name1: { method, params }, … })` |
| `POST /v1/ai/chat/completions` | NO SDK equivalent — call VibeCode endpoint via `fetch` directly |
| `POST /v1/search` (web search) | NO SDK equivalent — same as above |

## Items in `SUGGESTED-EXAMPLES.md`

See that file for the prioritised list of recipes I'd add next given a free hour each.

## What's likely to break first

- **Anything matching `'STAGE_ID'` exactly when category prefixes are in play.** Search is strict. The `baseStage()` helper sidesteps this, but a careless `filter: { stageId: 'NEW' }` will silently match nothing on multi-funnel portals.
- **Forgetting `customKey: 'items'`** when paging `crm.item.list`. You get the first page only and the loop "completes" without an error.
- **Browser shipping `B24Hook`.** The webhook URL contains a long-lived secret. The SDK warns at runtime, but a build that imports the wrong entry point won't fail at compile time. The skill says this in two places; if it bites someone, make it three.
