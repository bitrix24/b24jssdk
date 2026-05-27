# Suggested examples to add

Gaps in the current skill set, re-prioritised after the 2026-05 migration to `actions.v{2,3}.*`. Each entry: who benefits, why it matters, and an estimate (S = small, half-day; M = medium; L = large) of effort to write a polished version.

## Done (in `b24jssdk-recipes/examples/`)

- ~~OAuth install handshake~~ → recipe 12 (`12-oauth-install.ts`)
- ~~Error-handling cookbook~~ → recipe 10 (`10-error-handling.ts`)
- ~~Outbound event registration~~ → recipe 11 (`11-event-registration.ts`)

## High-impact, missing entirely

### 2. Per-portal multi-tenant backend pattern — **M**
Recipe 12 (OAuth install) is the foundation. The next step is a production-grade variant: LRU-cached `B24OAuth` factory keyed by `member_id`, transactional storage for token refresh (Postgres `ON CONFLICT UPDATE` so concurrent workers don't lose tokens), structured handling of revoked installs.

### 3. Frame app boot template (Vue 3 + Nuxt) — **M**
We have the docs site Nuxt module, and `useB24Helper`, but no end-to-end "scaffold a working in-frame Vue page" recipe. Showing:
- `initializeB24Frame()` with an error-state UI
- `parent.fitWindow()` after content renders
- `helper.profileInfo` for the greeting
- `slider.openPath` + mobile fallback
- Save/restore via `options.appSet`

The current `playgrounds/nuxt` is a manual smoke harness, not a teaching example.

### 4. Pull-driven CRM mirror — **M**
`useB24Helper` + Pull subscription that reflects deal updates in real time without polling. Recipe 3 polls today; the Pull-based variant would be a strict upgrade for in-frame apps, and showcases a feature we don't currently demonstrate end-to-end.

### 5. `batchByChunk.make` bulk import — **S**
Right now no recipe uses `batchByChunk.make`. The most natural example: import 5000 contacts from a CSV. Also covers `Type` runtime guards and `Text.numberFormat` for progress.

### 6. CRM duplicate detection / dedup — **S**
`crm.duplicate.findbycomm` is a one-call solution for "is this email/phone already a contact?". Comes up in every lead-import workflow.

### 7. `actions.v3.aggregate.make` for analytics — **M** (once available in SDK)
The v3 protocol supports aggregate functions (`sum`, `count`, `countDistinct`, etc., per `.claude/bitrix24-rest-v3-reference.md:304-368`), but the SDK doesn't expose a typed `aggregate.make` action yet. When it lands, Recipe 1 (CRM analytics) becomes a one-call query instead of loading all deals into memory.

## Lower-impact but useful

### 10. Reading custom fields (UF) and listing field metadata — **S**
`crm.item.fields` with `entityTypeId`, then filtering by `'>=ufCrmInn': '7700000000'`. Comes up every time a customer says "we use a custom field for…".

### 11. File upload (multipart) — **M**
The Disk recipe explicitly skips this. A recipe showing how to upload a binary via `disk.folder.uploadfile` (multipart) is well within the SDK's wheelhouse — the underlying `Http` accepts `FormData`. Worth a separate recipe because it's the one Disk operation people actually need.

### 12. Calendar events bulk export — **S**
`calendar.event.get` with type/ownerId, week-window paging. A two-page recipe covering ICS-style export.

### 13. Deal pipeline migration — **M**
Move N deals from one funnel category to another, preserving stage by base name. Real-world ops task; uses `batchByChunk.make` and the `baseStage()` helper.

### 14. Currency-aware revenue dashboard — **S**
Recipe 1 (CRM analytics) treats every amount as the same currency. A `helper.currency` + `crm.currency.list` extension that converts to a base currency before summing is small but useful.

### 15. Telegram bot with grammy `inlineKeyboard` actions — **S**
Recipe 6 sends notifications. An interactive variant ("take ownership", "mark as junk" buttons) is a one-screen extension.

### 16. AI assistant: function-calling loop — **M**
Recipe 8 is one-shot. A version that lets GPT call back into Bitrix24 (via OpenAI tool-calling for `getDeal`, `createTask`, `updateDeal`) is the modern shape and shows how to bridge LLM tool schemas with `actions.v{2,3}.call.make`.

### 17. Frame placement: a "select value" picker — **S**
Use `dialog.selectCRM` + `placement.setValue` to build a custom CRM-field picker. Shows the `setValue` JSON-stringify-on-the-way-back flow end-to-end.

## Documentation-only

### 18. "When to use which list method" decision flow chart — **S**
We have prose in `b24jssdk-rest`. A small ASCII flow chart inline (`select.length > 1000?` → `callList.make`; `> 10k?` → `fetchList.make`; `parallel chunks?` → `batchByChunk.make`) makes it scannable.

### 19. Per-method version mapping table — **M**
A table showing, for each common Bitrix24 method, whether to use `actions.v2.*` or `actions.v3.*` today and which will move to v3 in the future. The current table is split across two skills (`b24jssdk-core`, `b24jssdk-rest`) and the version-manager source.

## Recommended next picks

1. **#3** — Vue/Nuxt frame boot template. Biggest remaining gap for in-frame app authors.
2. **#5** — `batchByChunk.make` bulk import. Demonstrates a feature no recipe currently exercises.
3. **#2** — Per-portal multi-tenant backend (builds on recipe 12).
4. **#7** — `aggregate.make` (when SDK exposes the action).
