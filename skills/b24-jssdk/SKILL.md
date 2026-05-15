---
name: b24-jssdk
description: Build Bitrix24 REST integrations with @bitrix24/b24jssdk — frame placements, server-side webhooks, OAuth apps, real-time Pull events, and the Nuxt module. Use when calling the Bitrix24 REST API from JS/TS code or generating SDK usage examples.
---

# Bitrix24 JS SDK

JS/TS SDK for the Bitrix24 REST API. Three concrete entry points share one REST surface (`AbstractB24`):

- **`B24Frame`** — runs inside a Bitrix24 placement iframe; auth comes from the parent window.
- **`B24Hook`** — server-side incoming webhook; auth is embedded in the URL.
- **`B24OAuth`** — OAuth-based local apps; manages access/refresh tokens.

All three expose the same REST surface via two manager namespaces:

- `b24.actions.v{2,3}.{call, callList, fetchList, batch, batchByChunk}.make(options)` — REST calls.
- `b24.tools.{healthCheck, ping}.make(options?)` — utility checks.

Results are uniform `Result` / `AjaxResult` / `CallBatchResult` objects.

> The legacy `$b24.callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk` still exist for backwards compatibility but are deprecated and **will be removed in v2.0.0**. New code uses the action managers.

Ships ESM + UMD only since v0.4.0. Nuxt users should prefer the [`@bitrix24/b24jssdk-nuxt`](references/recipes/nuxt-module.md) module.

## Authoritative API references

This skill teaches **when to use which entry point and method** and **how to wire things up correctly**. For exact signatures, props, and payload shapes, prefer these primary sources:

- [`packages/jssdk/README-AI.md`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/README-AI.md) — code-oriented API guide. Aligned with the current `b24.actions.*` API and the deprecation notice at the top. Use this when generating SDK code.
- [Documentation site](https://bitrix24.github.io/b24jssdk/) — public docs; pages under `/reference/` mirror types and managers.
- [Bitrix24 REST documentation](https://apidocs.bitrix24.com/) — for REST method names, params, and payload shapes.

## Core rules (always apply)

1. **Pick the right entry point** — see [entry-points](references/guidelines/entry-points.md). `B24Frame` for iframe placements, `B24Hook` for server scripts, `B24OAuth` for OAuth local apps. Never use `B24Hook` from the browser (it warns and leaks the secret).
2. **Always `await` the initializer** — `initializeB24Frame()`, `B24Hook.fromWebhookUrl()`, or `B24OAuth` setup must complete before any REST call.
3. **Cleanup on unmount** — call `$b24.destroy()` when a frame component/page unmounts. The Pull client and message listeners hold references otherwise.
4. **Use named imports only** — the SDK has no default export and is `sideEffects: false`. Never destructure or rebind types under different names without need; tree-shaking depends on direct imports.
5. **Use the action managers, not the deprecated `call*` methods** — write `$b24.actions.v{2,3}.call.make({ method, params })`, not `$b24.callMethod(...)`. **Default to v2** — most methods (CRM, IM, user, profile, …) are v2-only today. Reach for v3 only when calling `tasks.task.*` / `main.eventlog.*` / meta endpoints. See [conventions](references/guidelines/conventions.md), [rest-api-v2](references/recipes/rest-api-v2.md), [rest-api-v3](references/recipes/rest-api-v3.md).
6. **Treat `Result` / `AjaxResult` as the uniform return shape** — `getData()`, `isSuccess`, `getErrorMessages()`. `AjaxResult` adds `isMore()` / `getNext()` / `getTotal()` for **v2-only** manual paging — these are `@deprecated` and v3 has no equivalent (use `callList.make` / `fetchList.make` everywhere, and `aggregate` for counts in v3).
7. **Pick the right list strategy** — `callList.make` only for small known sets (< 1000), `fetchList.make` for streaming, `call.make` + `AjaxResult.getNext()` for custom paging. See [list-pagination](references/recipes/list-pagination.md).
8. **Respect rate limits** — the built-in `RestrictionManager` throttles automatically; for enterprise portals the `LicenseManager` swaps in higher-limit params. See [rate-limiting](references/guidelines/rate-limiting.md).

## How to use this skill

Based on the task, load the relevant reference files **before writing any code**. Don't load everything — only what's needed.

### Reference files

**Guidelines** — decisions and conventions:
- [entry-points](references/guidelines/entry-points.md) — decision matrix: `B24Frame` vs `B24Hook` vs `B24OAuth`, runtime constraints.
- [conventions](references/guidelines/conventions.md) — imports, named exports, `Result` / `AjaxResult` shape, lifecycle, common pitfalls.
- [error-handling](references/guidelines/error-handling.md) — `AjaxError`, `SdkError`, batch error aggregation, retry strategies.
- [rate-limiting](references/guidelines/rate-limiting.md) — `RestrictionManager`, `OperatingLimiter`, `AdaptiveDelayer`, `ParamsFactory` presets.
- [logger](references/guidelines/logger.md) — `LoggerBrowser.build`, dev mode, `LoggerFactory`, default null logger.

**Recipes** — complete patterns for common tasks:

REST surface (mirror pair):
- [rest-api-v2](references/recipes/rest-api-v2.md) — `b24.actions.v2.{call, callList, fetchList, batch, batchByChunk}` — full code reference. Covers most methods today (CRM, IM, user, profile, …).
- [rest-api-v3](references/recipes/rest-api-v3.md) — `b24.actions.v3.*` mirror. v3 currently supports a small set (`tasks.task.*`, `main.eventlog.*`, meta endpoints); prefer v2 elsewhere.

Decision pages (point at the right v2/v3 example):
- [batch-calls](references/recipes/batch-calls.md) — when to batch vs single, input shapes, halt-on-error.
- [list-pagination](references/recipes/list-pagination.md) — `callList` vs `fetchList` vs manual paging.

Entry points & integrations:
- [frame-apps](references/recipes/frame-apps.md) — `initializeB24Frame()` boot, lifecycle, basic REST calls.
- [webhook-server](references/recipes/webhook-server.md) — Node server with `B24Hook.fromWebhookUrl()`.
- [oauth-apps](references/recipes/oauth-apps.md) — `B24OAuth` setup, refresh-token errors.
- [nuxt-module](references/recipes/nuxt-module.md) — `@bitrix24/b24jssdk-nuxt` module setup.

Frame & helpers:
- [ui-integrations](references/recipes/ui-integrations.md) — sliders, dialogs, parent window, placement, options (frame-only).
- [helper-manager](references/recipes/helper-manager.md) — `useB24Helper()`, profile/app/currency/license/options managers.
- [pull-client](references/recipes/pull-client.md) — Pull (push) subscription, channel manager.

**Quick reference:**
- [api-surface](references/api-surface.md) — categorized index of public exports — entry points, REST helpers, types/enums, tools.

### Routing table

| Task | Load these references |
|---|---|
| Build a Bitrix24 frame placement (iframe app) | entry-points, conventions, frame-apps, rest-api-v2 |
| Open sliders / dialogs / interact with portal UI | conventions, ui-integrations |
| Server-side script / cron / Node service against Bitrix24 | entry-points, conventions, webhook-server, rest-api-v2 |
| OAuth-based local app (refresh tokens) | entry-points, conventions, oauth-apps, rest-api-v2 |
| Use the SDK from a Nuxt app | conventions, frame-apps, nuxt-module |
| Fetch large data sets from REST | conventions, list-pagination, rest-api-v2 (or rest-api-v3) |
| Call multiple related methods efficiently | conventions, batch-calls, rest-api-v2 (or rest-api-v3) |
| Call a `tasks.task.*` / `main.eventlog.*` method | conventions, rest-api-v3 |
| Show portal data (current user, currency, options) | conventions, helper-manager |
| React to real-time events from the portal | conventions, helper-manager, pull-client |
| Handle errors / write retry logic | conventions, error-handling, rate-limiting |
| Tune throttling for high-volume scripts | rate-limiting |
| Set up logging | logger |
| General SDK usage / "where is X exported from" | api-surface, conventions |

## Installation

### Core SDK (any JS/TS project)

```bash
pnpm add @bitrix24/b24jssdk
```

```ts
import { initializeB24Frame, B24Hook, B24OAuth } from '@bitrix24/b24jssdk'
```

Supported Node versions: `^18`, `^20`, or `>=22`.

### Nuxt module (preferred for Nuxt apps)

```bash
npx nuxi module add @bitrix24/b24jssdk-nuxt
```

The module registers a runtime plugin only — it does **not** wrap or rename SDK exports. Import the SDK as usual; the plugin handles SSR-safe access. See [nuxt-module](references/recipes/nuxt-module.md).

### UMD (CDN, no bundler)

```html
<script src="https://unpkg.com/@bitrix24/b24jssdk@latest/dist/umd/index.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    const $b24 = await B24Js.initializeB24Frame()
    const response = await $b24.actions.v2.call.make({
      method: 'crm.item.list',
      params: { entityTypeId: B24Js.EnumCrmEntityTypeId.company, select: ['id', 'title'] }
    })
    console.log(response.getData().result.items)
  })
</script>
```

The global is `window.B24Js`. UMD is intended for static iframe placements that can't run a bundler — server-side `B24Hook` and OAuth apps should always use ESM.
