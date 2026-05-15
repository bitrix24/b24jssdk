# Suggested examples to add

Gaps in the current skill set, re-prioritised after the 2026-05 migration to `actions.v{2,3}.*`. Each entry: who benefits, why it matters, and an estimate (S = small, half-day; M = medium; L = large) of effort to write a polished version.

## High-impact, missing entirely

### 1. OAuth install handshake (B24OAuth, end-to-end) — **L**
The README-AI mentions `new B24OAuth(authParams, secret)` but assumes someone already produced `authParams`. A real OAuth app needs:
- Express endpoint that handles `ONAPPINSTALL` / `ONAPPUPDATE` events
- Persisting `accessToken`/`refreshToken`/`expires`/`memberId` per portal
- Loading them into `B24OAuth` on every cold start
- Wiring `setCallbackRefreshAuth` to write the refreshed pair back

Biggest blocker for anyone shipping a Marketplace-listed app.

### 2. Per-portal multi-tenant backend pattern — **M**
A backend that serves many Bitrix24 portals (one OAuth app, N installations) needs a `B24OAuth` factory keyed by `member_id`. Cache strategy, lifecycle, handling revoked installs.

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

### 6. Error-handling cookbook with `hardErrorCodes` / `softErrorCodes` — **S**
A short recipe showing common AjaxError codes and the right reaction, including the new restriction-manager knobs:
- `QUERY_LIMIT_EXCEEDED` → automatic backoff
- `EXPIRED_TOKEN` (B24OAuth) → refresh
- `ERROR_NOT_FOUND` → swallow vs surface
- Per-app custom codes via `hardErrorCodes`
- Non-idempotent calls via `retryOnNetworkError: false`

Short but missing — AI agents get this wrong constantly.

### 7. CRM duplicate detection / dedup — **S**
`crm.duplicate.findbycomm` is a one-call solution for "is this email/phone already a contact?". Comes up in every lead-import workflow.

### 8. Outbound event registration recipe — **S**
Recipe 7 receives webhooks but assumes `crm.event.bind` was already done. A 30-line recipe showing how to register/list/unregister events from the SDK closes that loop.

### 9. `actions.v3.aggregate.make` for analytics — **M** (once available in SDK)
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

## Recommended order (if I were choosing)

1. **#1** — OAuth install handshake. Biggest blocker by a wide margin.
2. **#6** — Error-handling cookbook (incl. `hardErrorCodes`/`softErrorCodes`/`retryOnNetworkError`). Highest ROI per page.
3. **#8** — Outbound event registration. Closes recipe 7's loop.
4. **#5** — `batchByChunk.make` bulk import.
5. **#3** — Vue/Nuxt frame boot template.
6. **#9** — `aggregate.make` (when SDK exposes it).
