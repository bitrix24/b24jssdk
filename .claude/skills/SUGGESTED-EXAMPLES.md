# Suggested examples to add

These are gaps in the current example set. Each entry: who benefits, why it matters, and an estimate (S = small, half-day; M = medium; L = large) of effort to write a polished version.

## High-impact, missing entirely

### 1. OAuth install handshake (B24OAuth, end-to-end) — **L**
The README-AI mentions `new B24OAuth(authParams, secret)` but assumes someone already produced `authParams`. A real OAuth app needs:
- Express endpoint that handles `ONAPPINSTALL` / `ONAPPUPDATE` events
- Persisting `accessToken`/`refreshToken`/`expires`/`memberId` per portal
- Loading them into `B24OAuth` on every cold start
- Wiring `setCallbackRefreshAuth` to write the refreshed pair back

This is the single biggest blocker for anyone shipping a Marketplace-listed app. We have nothing on it.

### 2. Per-portal multi-tenant backend pattern — **M**
A backend that serves many Bitrix24 portals (one OAuth app, N installations) needs a `B24OAuth` factory keyed by `member_id`. Cache strategy, lifecycle, what to do when an install gets revoked. Recipe-style.

### 3. Frame app boot template (Vue 3 + Nuxt) — **M**
We have the docs site Nuxt module, and `useB24Helper`, but no end-to-end "scaffold a working in-frame Vue page" recipe. Showing:
- `initializeB24Frame()` with an error-state UI
- `parent.fitWindow()` after content renders
- `helper.profileInfo` for the greeting
- `slider.openPath` + mobile fallback
- Save/restore via `options.appSet`

The current `playgrounds/nuxt` is a manual smoke harness, not a teaching example.

### 4. Pull-driven CRM mirror — **M**
useB24Helper + Pull subscription that reflects deal updates in real time without polling. Recipe 3 polls today; the Pull-based variant would be a strict upgrade for in-frame apps, and showcases a feature we don't currently demonstrate end-to-end.

### 5. `callBatchByChunk` for bulk import — **S**
Right now no recipe uses `callBatchByChunk`. The most natural example: import 5000 contacts from a CSV. It also covers `Type` runtime guards and `Text.numberFormat` for progress.

### 6. Error-handling cookbook — **S**
A short recipe showing common AjaxError codes and the right reaction:
- `QUERY_LIMIT_EXCEEDED` → backoff via `RestrictionManager`
- `EXPIRED_TOKEN` (B24OAuth) → trigger refresh
- `ERROR_NOT_FOUND` → swallow vs surface
- 5xx → exponential retry

Short but missing — this is something AI agents get wrong constantly.

### 7. CRM duplicate detection / dedup — **S**
`crm.duplicate.findbycomm` is a one-call solution for "is this email/phone already a contact?". Comes up in every lead-import workflow.

### 8. Outbound event registration recipe — **S**
Recipe 7 receives webhooks but assumes `crm.event.bind` was already done. A 30-line recipe showing how to register/list/unregister events from the SDK closes that loop.

## Lower-impact but useful

### 9. Reading custom fields (UF) and listing field metadata — **S**
`crm.deal.userfield.list`, then filtering by `'>=ufCrmInn': 7700000000`. Comes up every time a customer says "we use a custom field for…".

### 10. File upload (multipart) — **M**
The Disk recipe explicitly skips this. A recipe showing how to upload a binary via `disk.folder.uploadfile` (multipart) is well within the SDK's wheelhouse — `Http.request` accepts `FormData`. Worth a separate recipe because it's the one Disk operation people actually need.

### 11. Calendar events bulk export — **S**
`calendar.event.get` with type/ownerId, week-window paging. A two-page recipe covering ICS-style export.

### 12. Deal pipeline migration — **M**
Move N deals from one funnel category to another, preserving stage by base name. Real-world ops task; uses `callBatchByChunk` and the `baseStage()` helper.

### 13. Currency-aware revenue dashboard — **S**
Recipe 1 (CRM analytics) treats every amount as the same currency. A `helper.currency` + `crm.currency.list` extension that converts to a base currency before summing is small but useful.

### 14. Telegram bot with grammy `inlineKeyboard` actions — **S**
Recipe 6 sends notifications. An interactive variant ("take ownership", "mark as junk" buttons) is a one-screen extension.

### 15. AI assistant: function-calling loop — **M**
Recipe 8 is one-shot. A version that lets GPT call back into Bitrix24 (via OpenAI tool-calling for `getDeal`, `createTask`, `updateDeal`) is the modern shape and shows how to bridge LLM tool schemas with `callMethod`.

## Documentation-only

### 16. "When to use which list method" decision flow chart — **S**
We have prose in `b24jssdk-rest`. A small ASCII flow chart inline (`select.length > 1000?` → `callListMethod`; `> 10k?` → `fetchListMethod`; `parallel chunks?` → `callBatchByChunk`) makes it scannable.

### 17. Per-API-version mapping table — **M**
A page that, for each common entity (deal, contact, lead, company, task), shows the v3 method, the classic method, the field-name diff, and which to prefer for new code. Currently this is implicit in `b24jssdk-filtering`.

## Recommended order (if I were choosing)

1. **#1** — OAuth install handshake. Biggest blocker by a wide margin.
2. **#6** — Error-handling cookbook. Highest ROI per page.
3. **#8** — Outbound event registration. Closes recipe 7's loop.
4. **#5** — `callBatchByChunk` bulk import.
5. **#3** — Vue/Nuxt frame boot template.
