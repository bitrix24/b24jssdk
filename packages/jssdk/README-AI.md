# Bitrix24 JS SDK — AI Guide

> ⚠️ **This file is transitional and will be removed.**
>
> Its content is being progressively absorbed into [`AGENTS.md`](../../AGENTS.md) (the root agent-facing guide) and the four focused guides under [`.github/contributing/`](../../.github/contributing/). Future PRs will continue migrating sections out of here until the file can be deleted.
>
> **Until then:**
>
> - When this guide disagrees with `AGENTS.md` or the `.github/contributing/` guides, **`AGENTS.md` wins**. Do not "fix" `AGENTS.md` to match this file.
> - **Do not add new material here.** New conventions, examples, and patterns belong in `AGENTS.md` or the matching contributing guide.
> - Bug-fix edits to existing sections are fine (e.g. correcting a stale API name) but should be mirrored into the canonical location as part of the same PR when possible.

---

Purpose: give AI agents a precise, code-oriented overview of the SDK to generate working Bitrix24 apps. This SDK lets you:

- Call Bitrix24 REST API from apps embedded in Bitrix24 (iframe) and from backend services
- Interact with Bitrix24 UI: open sliders, dialogs, resize frame, set in-app page title (`#pagetitle`, not the browser tab), IM integrations, etc.
- Manage app/user options via the parent portal
- Use helpers (profile/app/options/currencies/licenses/payments) and Pull client

Core building blocks:

- Frontend in frame: B24Frame + initializeB24Frame()
- Backend/service: B24Hook (webhook-based)
- REST utilities: callMethod, callBatch, callListMethod, fetchListMethod
- UI managers: parent, slider, dialog, placement, options, auth
- Helpers: B24HelperManager and useB24Helper hook; Pull client

Note: the package ships ESM, CommonJS, and UMD builds. ESM is the recommended entry point; CommonJS is supported via `require('@bitrix24/b24jssdk')`, and the UMD build is for `<script>` usage in the browser.

## Deprecation notice — read before generating code

The following surface is `@deprecated` and **scheduled for removal in `2.0.0`**.
Many examples in this document still reference it because it remains the most
widely-used path today, but new code should target the `actions.v{2,3}.*` API.

| Deprecated | Replacement |
|---|---|
| `b24.callMethod(method, params, start?)` | `b24.actions.v2.call.make({ method, params })` / `b24.actions.v3.call.make({ method, params })` |
| `b24.callBatch(calls, isHaltOnError?, returnAjaxResult?)` | `b24.actions.v2.batch.make({ calls, options })` / `b24.actions.v3.batch.make(...)` |
| `b24.callBatchByChunk(calls, isHaltOnError)` | `b24.actions.v2.batchByChunk.make({ calls, options })` / `b24.actions.v3.batchByChunk.make(...)` |
| `b24.callListMethod(method, params, progress?, customKey?)` | `b24.actions.v2.callList.make({ method, params, customKeyForResult })` / `b24.actions.v3.callList.make(...)` |
| `b24.fetchListMethod(method, params, idKey?, customKey?)` | `b24.actions.v2.fetchList.make({ method, params, idKey, customKeyForResult })` / `b24.actions.v3.fetchList.make(...)` |
| `AjaxResult#isMore()`, `#hasMore()`, `#getNext()`, `#fetchNext()`, `#getTotal()` | The `next`/`total` envelope fields are `restApi:v2`-only (no `restApi:v3` counterpart). Do not iterate manually — let `actions.v{2,3}.{callList,fetchList}` handle pagination. `restApi:v3` has no `total` in the envelope; for a count use `actions.v3.aggregate.make` (`@experimental`) with `count`/`countDistinct` on a method that exposes an `*.aggregate` action — check `rest.documentation.openapi` to confirm the endpoint exists; otherwise reduce a `callList` client-side. |

`AjaxResult.getData()` returns exactly `{ result: T, time: PayloadTime }` — the
v2-only `next` and `total` fields are no longer surfaced through the public type.


## Frontend in Bitrix24 (TypeScript, ESM)

Use when your app runs inside Bitrix24 as an iframe placement. The SDK initializes by messaging with the parent window and supplies auth tokens automatically.

Minimal contract

- `initializeB24Frame(): Promise<B24Frame>`
- `B24Frame.isInit`: boolean (after init)
- Auth auto-refresh on 401 (expired/invalid token)

Example: initialize, call REST, cleanup

```ts
import {
  initializeB24Frame,
  B24Frame,
  EnumCrmEntityTypeId,
  Text,
  LoggerBrowser,
  Result,
  type ISODate
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
let $b24: B24Frame

async function boot() {
  $b24 = await initializeB24Frame()

  // Single method
  const companies = await $b24.callMethod('crm.item.list', {
    entityTypeId: EnumCrmEntityTypeId.company,
    order: { id: 'desc' },
    select: ['id', 'title', 'createdTime']
  })
  logger.info('items:', companies.getData().result)

  // Batch (object syntax, with keys)
  const batch: Result = await $b24.callBatch({
    CompanyList: {
      method: 'crm.item.list',
      params: {
        entityTypeId: EnumCrmEntityTypeId.company,
        order: { id: 'desc' },
        select: ['id', 'title', 'createdTime']
      }
    }
  }, true)
  const data = batch.getData()
  const list = (data.CompanyList.items || []).map((it: any) => ({
    id: Number(it.id),
    title: it.title,
    createdTime: Text.toDateTime(it.createdTime as ISODate)
  }))
  logger.info('batch list:', list)
}

function teardown() {
  $b24?.destroy()
}
```

Useful getters and services on B24Frame

- auth: getAuthData(), refreshAuth(), isAdmin; getAppSid()
- parent: fitWindow(), resizeWindow(w,h), resizeWindowAuto(node?, minH?, minW?), setTitle(title), closeApplication(), reloadWindow(), scrollParentWindow(scroll)
- slider: getUrl(path), openPath(url[, width]), openSliderAppPage(params), closeSliderAppPage()
- dialog: selectUser(), selectUsers()  [selectAccess(), selectCRM() are deprecated]
- placement: title, options, isSliderMode, getInterface(), bindEvent(event, cb), call(command, params), callCustomBind(command, params?, cb)
- options: appGet/set, userGet/set
- getLang(): portal UI language

Patterns

- Always await initializeB24Frame() before any call.
- Destroy on page/component unmount with $b24.destroy().
- For large result sets prefer callListMethod or fetchListMethod.
- For big batches use callBatchByChunk to respect limits.
- A per-command `result` inside a batch can be `null` when the underlying REST method legitimately returns `null` (e.g. `im.chat.get` with non-matching params). Declare the generic as `T | null` and handle the `null` branch — the SDK no longer coerces it to `{}` (see issue #23).
- `restApi:v3` batch is all-or-nothing: per-command errors are not returned. If any call fails, the whole batch fails and `response.getErrorMessages()` carries the error.


## Frontend via UMD (CDN)

When you can’t bundle ESM, load the global B24Js from a CDN inside your iframe app.

```html
<script src="https://unpkg.com/@bitrix24/b24jssdk@latest/dist/umd/index.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const logger = B24Js.LoggerBrowser.build('MyApp', true)
      const $b24 = await B24Js.initializeB24Frame()

      const res = await $b24.callBatch({
        CompanyList: {
          method: 'crm.item.list',
          params: {
            entityTypeId: B24Js.EnumCrmEntityTypeId.company,
            order: { id: 'desc' },
            select: ['id', 'title', 'createdTime']
          }
        }
      }, true)

      logger.info('data:', res.getData())
    } catch (e) {
      console.error(e)
    }
  })
</script>
```

Globals exposed by UMD

- B24Js.initializeB24Frame
- B24Js.B24Frame and managers via properties (auth, parent, slider, dialog, placement, options)
- Utilities: LoggerBrowser, Text, Type, enums (e.g., EnumCrmEntityTypeId), Result, AjaxError/AjaxResult, etc.


## Backend/Services (Node.js, ESM) with B24Hook

Use B24Hook when calling Bitrix24 REST from servers or scripts via incoming webhook. Auth is embedded in the webhook path and no frame is required.

Minimal contract

- new B24Hook({ b24Url, userId, secret }) or B24Hook.fromWebhookUrl(url)
- callMethod, callBatch, callListMethod, fetchListMethod

Example: construct from webhook URL and call API

```ts
import {
  B24Hook,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  Result
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Srv', true)

const $b24 = B24Hook.fromWebhookUrl(
  'https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3'
)

// Optional: silence client-side warning (Node is server-side)
$b24.offClientSideWarning?.()

// Single method
const res = await $b24.callMethod('crm.item.list', {
  entityTypeId: EnumCrmEntityTypeId.company,
  order: { id: 'desc' },
})
logger.info('companies:', res.getData().result)

// Batch (array syntax)
const batch: Result = await $b24.callBatch([
  ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'] }],
  ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'] }]
], true)
logger.info('batch:', batch.getData())
```

Listing helpers

```ts
// Pull a full list with automatic paging
const list = await $b24.callListMethod('crm.item.list', {
  entityTypeId: EnumCrmEntityTypeId.deal,
  select: ['id', 'title']
})
console.log(list.getData()) // array of items

// Or stream chunks
for await (const chunk of $b24.fetchListMethod('crm.item.list', { entityTypeId: EnumCrmEntityTypeId.deal }, 'id')) {
  console.log('chunk size', chunk.length)
}
```

Notes

- Supported Node versions: ^18, ^20, or >=22.
- B24Hook warns if used on the client; keep it server-side.


## UI Integrations in Frame (sliders, dialogs, parent window)

These require a B24Frame (i.e., running inside Bitrix24 placement iframe).

Sliders

```ts
// Open a portal path in a slider
const url = $b24.slider.getUrl('/crm/deal/details/1')
const result = await $b24.slider.openPath(url, 1640)
if (result.isOpenAtNewWindow) {
  // On mobile, falls back to window.open and returns close status after polling
}

// Open your application page as a slider and then close it
await $b24.slider.openSliderAppPage({ some: 'params' })
await $b24.slider.closeSliderAppPage()
```

Dialogs

```ts
const user = await $b24.dialog.selectUser()         // null | { id, name, ... }
const users = await $b24.dialog.selectUsers()       // SelectedUser[]
// selectAccess() and selectCRM() exist but are deprecated
```

Parent window and IM integrations

```ts
await $b24.parent.fitWindow()
await $b24.parent.setTitle('My Page')        // in-page #pagetitle, not the browser tab
await $b24.parent.scrollParentWindow(0)
await $b24.parent.imCallTo(5, true)          // video call to user 5
await $b24.parent.imOpenMessenger('chat12')  // open messenger
```

Placement API

```ts
// Placement meta
console.log($b24.placement.title, $b24.placement.options, $b24.placement.isSliderMode)

// Query interface capabilities
const iface = await $b24.placement.getInterface()

// Bind placement events or custom commands
await $b24.placement.bindEvent('onMessage', (...args) => console.log(args))
await $b24.placement.call('someCommand', { foo: 'bar' })
await $b24.placement.callCustomBind('someCommand', { opt: 1 }, (...args) => {})
```

Options

```ts
// App-level
await $b24.options.appSet('installComplete', true)
const appFlag = $b24.options.appGet('installComplete')

// User-level
await $b24.options.userSet('theme', 'dark')
const theme = $b24.options.userGet('theme')
```

Auth and environment

```ts
const auth = $b24.auth.getAuthData() // { access_token, refresh_token, expires_in, domain, member_id } | false
if (!auth) {
  await $b24.auth.refreshAuth()
}
const lang = $b24.getLang()          // portal UI language
const sid = $b24.getAppSid()         // app SID in current session
```


## Helpers and Pull Client

The SDK ships a high-level helper to preload portal and app data and to work with Pull client.

Initialization pattern (after B24Frame is initialized)

```ts
import { useB24Helper, LoadDataType, type TypePullMessage } from '@bitrix24/b24jssdk'

const {
  initB24Helper,
  destroyB24Helper,
  getB24Helper,
  usePullClient,
  useSubscribePullClient,
  startPullClient
} = useB24Helper()

const $b24 = await initializeB24Frame()
await initB24Helper($b24, [
  LoadDataType.Profile,
  LoadDataType.App,
  LoadDataType.Currency,
  LoadDataType.AppOptions,
  LoadDataType.UserOptions,
])

// Enable Pull
usePullClient('prefix')      // optionally pass userId
useSubscribePullClient((m: TypePullMessage) => {
  // handle Pull messages
}, 'application')
startPullClient()

// Access helper data and extra managers
const helper = getB24Helper()
const userId = helper.profileInfo.data.id
const uniq = $b24.auth.getUniq('prefix') // unique per member
```

Notes

- Helper managers: profile, app, payment, license, currency, options
- Currency and options managers internally use callBatch/callBatchByChunk


## REST calling model and error handling

Core REST utilities live in AbstractB24 and Http:

- callMethod(method, params[, start]) => `Promise<AjaxResult>`
- callBatch(calls, isHaltOnError = true, returnAjaxResult = false) => `Promise<Result>`
  - calls can be object { key: { method, params } } or array [ [method, params], ... ]
  - If isHaltOnError=false, Result accumulates errors (object-form calls are keyed by request label — read via getErrorsByKey()/getErrorMessagesByKey()); otherwise rejects on first error
  - If returnAjaxResult=true, you receive AjaxResult objects per command
- callListMethod(method, params, progress?, customKey?) => `Promise<Result>` (auto-paging)
- fetchListMethod(method, params, idKey='ID', customKey?) => `AsyncGenerator<any[]>`

### Choosing list retrieval strategy (recommendations)

- callListMethod: fetches the entire dataset into memory. Use only for small selections (< 1000 items) due to higher memory pressure.
- fetchListMethod: streams data in chunks via async iterator. Use for large datasets to keep memory usage low.
- callMethod (manual pagination): control paging via the `start` cursor. Use when you need precise batching and custom flow. For big data it’s typically less efficient/convenient than fetchListMethod.

Below are complete examples that iterate until all data are fetched.

#### A) Small datasets: callListMethod (all-in-memory)

Assumes `$b24` is already initialized (either B24Frame or B24Hook).

```ts
import { EnumCrmEntityTypeId, Result } from '@bitrix24/b24jssdk'

async function loadAllCompaniesSmall($b24: any) {
  const response: Result = await $b24.callListMethod(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.company,
      order: { id: 'asc' },
      select: ['id', 'title']
    },
    (progress: number) => {
      // Optional progress callback (0..100)
      // console.log('progress', progress)
    }
  )

  const items = response.getData() as any[]
  // Process all items (already fully loaded in memory)
  for (const row of items) {
    // ...process row
  }

  return items
}
```

#### B) Large datasets: fetchListMethod (streaming by chunks)

For `crm.item.list`, use `idKey: 'id'` so the fast-iterator strategy works reliably with v3 entities.

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

async function loadAllDealsStreaming($b24: any) {
  const all: any[] = []

  for await (const chunk of $b24.fetchListMethod(
    'crm.item.list',
    {
      entityTypeId: EnumCrmEntityTypeId.deal,
      select: ['id', 'title']
    },
    'id' // idKey for crm.item.list payloads
  )) {
    // Process current chunk
    for (const row of chunk) {
      // ...process row
    }
    all.push(...chunk)
  }

  return all
}
```

#### C) Manual pagination: callMethod + next pages

> **`@deprecated` — slated for removal in `2.0.0`.** `callMethod`, `isMore()`,
> and `getNext()` rely on the `restApi:v2` envelope field `next`, which
> `restApi:v3` does not return. Prefer `b24.actions.v{2,3}.fetchList.make` for
> custom-throttled iteration; that helper hides pagination for both API versions.

Use when you need to control page sizes, pauses, or add custom throttling. Iterate until `isMore()` returns false, using `getNext($b24.getHttpClient())`.

```ts
import { EnumCrmEntityTypeId, AjaxResult } from '@bitrix24/b24jssdk'

async function loadAllContactsManual($b24: any) {
  const all: any[] = []

  // First page (start defaults to 0)
  let page: AjaxResult = await $b24.callMethod('crm.item.list', {
    entityTypeId: EnumCrmEntityTypeId.contact,
    order: { id: 'asc' },
    select: ['id', 'name']
  }, 0)

  // Process first page
  all.push(...(page.getData().result as any[]))

  // Follow next cursors until done
  while (page.isMore()) {
    const next = await page.getNext($b24.getHttpClient())
    if (next === false) break

    // Optional: your throttling/backoff here
    // await new Promise(r => setTimeout(r, 50))

    all.push(...(next.getData().result as any[]))
    page = next
  }

  return all
}
```

Result and AjaxResult basics

```ts
import { AjaxError } from '@bitrix24/b24jssdk'

try {
  const res = await $b24.callMethod('crm.item.get', { entityTypeId: 1, id: 10 })
  const payload = res.getData()                  // { result, time } — see Deprecation notice
  const ok = res.isSuccess                       // boolean
  // const total = res.getTotal()                // @deprecated, removed in 2.0.0; v3 has no `total`
} catch (e) {
  if (e instanceof AjaxError) {
    console.error(e.code, e.description, e.status, e.requestInfo)
  } else {
    console.error(e)
  }
}
```


## Recommended generation patterns (for AI)

- Frontend
  - Always guard for frame context; initialize via await initializeB24Frame()
  - On component unmount call $b24.destroy()
  - For UI actions: prefer $b24.slider.openPath and handle mobile fallback via isOpenAtNewWindow in the returned StatusClose
  - Use $b24.parent.fitWindow() after content changes
  - Use $b24.options.appSet/userSet for settings persistence
- Backend
  - Construct B24Hook with B24Hook.fromWebhookUrl() when possible
  - Use callListMethod/fetchListMethod for large lists
  - Batch related calls with callBatch; chunk big arrays with callBatchByChunk
- Logging
  - Build once via LoggerBrowser.build(appName, isDev) and set to instances if needed
- Types and enums
  - Prefer exported enums (e.g., EnumCrmEntityTypeId) and types (ISODate, payload types)


## UMD vs ESM quick cheat sheet

- UMD: window.B24Js global; load via unpkg CDN; use inside Bitrix24 iframe
- ESM: import from '@bitrix24/b24jssdk'; works in browsers with bundlers and in Node (server-side) for B24Hook
- CommonJS: const { B24Hook } = require('@bitrix24/b24jssdk'); works in Node.js CJS projects (first-class CJS build with external deps, deduped against your node_modules)


## Caveats and constraints

- Frame-only APIs (dialogs, sliders, placement, parent, options, auth refresh) require running in Bitrix24 placement context
- openPath automatically handles mobile devices by opening a new tab and polling for close status; check the returned StatusClose
- Webhook (B24Hook) is not safe on the client; keep it on the server
- Batch limits apply (SDK default chunk size is 50)


## Export map (selected)

- initializeB24Frame, B24Frame and its managers: auth, parent, slider, dialog, placement, options
- B24Hook (+ B24Hook.fromWebhookUrl)
- AbstractB24 helpers: callMethod, callBatch, callListMethod, fetchListMethod, callBatchByChunk, chunkArray
- HTTP types and classes: AjaxResult, AjaxError, Result
- LoggerBrowser, Text, Type, Browser, tools/use-formatters
- Types/enums: http, b24, auth, payloads, user, slider, handler, placement, crm, catalog, bizproc, event, pull, b24-helper


---
This document is based on the SDK source in packages/jssdk/src and the docs under docs/reference and docs/guide. Use it as the authoritative prompt for generating code with this SDK.


## Extras for AI agents (helpers, pull, core, tools)

### Helper Methods (high-level data access)

- useB24Helper: lifecycle for helpers and Pull client in frame apps (see section above)
- B24HelperManager: container for helper managers (profile/app/payment/license/currency/options) exposed via useB24Helper
- ProfileManager: `helper.profileInfo.data` provides current user info
- AppManager: `helper.appInfo.data` and `helper.appInfo.statusCode`
- LicenseManager: adjusts Http Restriction Manager for enterprise automatically
- CurrencyManager: formats amounts for a currency and language
  
  ```ts
  const name = helper.currency.getCurrencyFullName('USD', 'en')
  const literal = helper.currency.getCurrencyLiteral('USD', 'en') // currency symbol/wording
  const price = helper.currency.format(1234.56, 'USD', 'en')
  ```
- OptionsManager (helper level): bulk save options to REST + optional pull notification
 
  
  ```ts
  await helper.appOptions.save({ featureFlags: helper.appOptions.encode({ a: 1 }) }, {
    moduleId: 'application',
    command: 'FEATURES_UPDATED',
    params: { source: 'app' }
  })
  const cfg = helper.appOptions.getJsonObject('featureFlags', {})
  ```

### Push and Pull

- Pull client helpers are provided via useB24Helper
  
  ```ts
  const { usePullClient, useSubscribePullClient, startPullClient } = useB24Helper()
  usePullClient('prefix')
  useSubscribePullClient((m) => { /* handle */ }, 'application')
  startPullClient()
  ```

### Core utilities

- AbstractB24: shared REST helpers (callMethod/batch/list/fetch/chunk)
- Http: low-level transport; supports restriction throttling and auth refresh
- RestrictionManager: automatic throttling to respect Bitrix24 limits

// fix
  ```ts
  // Example: increase limits for enterprise (done automatically by LicenseManager)
  // $b24.getHttpClient().setRestrictionManagerParams(RestrictionManagerParamsForEnterprise)
  ```
 
- Unique ID Generator: request IDs are appended automatically via Http
- Result / AjaxResult: uniform result objects, error aggregation. (Legacy paging helpers `isMore`/`getNext`/`getTotal` are `@deprecated` for `2.0.0` — see Deprecation notice.)
- Language List and LoggerBrowser

### Tools

- Type: runtime type helpers (isStringFilled, etc.)
- Text: dates (Luxon), numbers (numberFormat), UUID v7, encode/decode, case transforms
  
  ```ts
  import Text from '@bitrix24/b24jssdk'
  const dt = Text.toDateTime('2024-01-01T10:00:00Z')
  const s = Text.numberFormat(12345.678, 2, '.', ' ')
  const id = Text.getUuidRfc4122()
  ```
 
- Browser: lightweight browser utilities
- useFormatters: number/date formatting hooks
- pick/omit/getEnumValue: object and enum helpers
