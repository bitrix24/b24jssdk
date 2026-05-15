# Bitrix24 JS SDK — AI Guide

Purpose: give AI agents a precise, code-oriented overview of the SDK to generate working Bitrix24 apps. This SDK lets you:

- Call Bitrix24 REST API from apps embedded in Bitrix24 (iframe), from backend services via webhook, and from OAuth local apps
- Interact with Bitrix24 UI: open sliders, dialogs, resize frame, set page title, IM integrations, etc.
- Manage app/user options via the parent portal
- Use helpers (profile / app / options / currencies / licenses / payments) and the Pull (push) client

Core building blocks:

- **Frontend in frame:** `B24Frame` + `initializeB24Frame()`
- **Backend / service:** `B24Hook` (webhook-based)
- **OAuth apps:** `B24OAuth` (token refresh + recoverable failures)
- **REST surface (shared by all three):** `b24.actions.v{2,3}.{call, callList, fetchList, batch, batchByChunk}.make(options)`
- **Utility checks:** `b24.tools.{healthCheck, ping}.make(options?)`
- **UI managers (frame-only):** `parent`, `slider`, `dialog`, `placement`, `options`, `auth`
- **Helpers:** `B24HelperManager` and `useB24Helper()` composable; Pull client

> Companion documentation: [`skills/b24-jssdk/SKILL.md`](https://github.com/bitrix24/b24jssdk/blob/main/skills/b24-jssdk/SKILL.md) is an agent-oriented routing guide (decision matrices, recipes, anti-patterns). This README-AI is the code-pattern reference; the skill tells you **when** to reach for which pattern.

Note: since v0.4.0 the package ships ESM and UMD only (no CommonJS).

## Deprecation notice — read before generating code

The following surface is `@deprecated` and **scheduled for removal in `2.0.0`**. **Generate new code against `b24.actions.v{2,3}.*` only.** The legacy surface remains documented below the line where it's strictly necessary to recognise older codebases.

### v2 vs v3 — which version to call

`b24.actions.v2.*` and `b24.actions.v3.*` are independent endpoints, not a replacement-of-one-by-the-other. Pick by method:

- **v3 currently supports a small set:** `/tasks.task.*`, `/main.eventlog.*`, `/batch`, `/scopes`, `/rest.scope.list`, `/rest.documentation.openapi`, `/documentation`. Source of truth: [`packages/jssdk/src/core/version-manager.ts`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/core/version-manager.ts).
- **Everything else is v2-only** — CRM (`crm.item.*`, `crm.deal.*`, …), IM, `user.current`, `profile`, placement, options, settings.

`b24.actions.v3.call.make` throws `SdkError(JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3)` immediately for a v2-only method. `b24.actions.v3.batch.make` throws the same error if any one method in the batch isn't v3-supported — you cannot mix v2-only and v3 methods inside a single v3 batch.

Practical rule: **default to v2; switch the specific call to v3 only when its method is on the v3 list.** Examples below follow this rule.

| Deprecated | Replacement |
|---|---|
| `b24.callMethod(method, params, start?)` | `b24.actions.v3.call.make({ method, params, requestId })` / `b24.actions.v2.call.make(...)` |
| `b24.callBatch(calls, isHaltOnError?, returnAjaxResult?)` | `b24.actions.v3.batch.make({ calls, options })` / `b24.actions.v2.batch.make(...)` |
| `b24.callBatchByChunk(calls, isHaltOnError)` | `b24.actions.v3.batchByChunk.make({ calls, options })` / `b24.actions.v2.batchByChunk.make(...)` |
| `b24.callListMethod(method, params, progress?, customKey?)` | `b24.actions.v3.callList.make({ method, params, idKey, customKeyForResult })` / `b24.actions.v2.callList.make(...)` |
| `b24.fetchListMethod(method, params, idKey?, customKey?)` | `b24.actions.v3.fetchList.make({ method, params, idKey, customKeyForResult })` / `b24.actions.v2.fetchList.make(...)` |
| `AjaxResult#isMore()`, `#hasMore()`, `#getNext()`, `#fetchNext()`, `#getTotal()` | These rely on the `restApi:v2`-only `next`/`total` envelope fields and have no `restApi:v3` counterpart. Don't paginate manually — use `callList.make` / `fetchList.make`. For element counts in v3 use the `aggregate` action with `count` / `countDistinct`. |

`AjaxResult.getData()` returns exactly `{ result: T, time: PayloadTime }` — the v2-only `next` and `total` fields are no longer surfaced through the public type.


## Frontend in Bitrix24 (TypeScript, ESM)

Use when your app runs inside Bitrix24 as an iframe placement. The SDK initialises by messaging the parent window and handles auth automatically.

Minimal contract:

- `initializeB24Frame(): Promise<B24Frame>`
- `B24Frame.isInit`: boolean (after init)
- Auth auto-refresh on `401`

Example: initialise, call REST, cleanup.

```ts
import {
  initializeB24Frame,
  B24Frame,
  EnumCrmEntityTypeId,
  Text,
  LoggerBrowser,
  type ISODate
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('MyApp', import.meta.env?.DEV === true)
let $b24: B24Frame

interface Company { id: number, title: string, createdTime: ISODate }

async function boot() {
  $b24 = await initializeB24Frame()
  $b24.setLogger(logger)

  // Single method (v2 — crm.item.* is a v2 method)
  const response = await $b24.actions.v2.call.make<{ items: Company[] }>({
    method: 'crm.item.list',
    params: {
      entityTypeId: EnumCrmEntityTypeId.company,
      order: { id: 'desc' },
      select: ['id', 'title', 'createdTime']
    },
    requestId: 'companies-recent'
  })

  if (!response.isSuccess) {
    logger.error('failed', response.getErrorMessages())
    return
  }

  const items = response.getData().result.items.map((it) => ({
    id: it.id,
    title: it.title,
    createdTime: Text.toDateTime(it.createdTime)
  }))
  logger.info('items', items)

  // Named batch — v2 because crm.item.* is a v2-only method
  const batch = await $b24.actions.v2.batch.make({
    calls: {
      CompanyList: {
        method: 'crm.item.list',
        params: {
          entityTypeId: EnumCrmEntityTypeId.company,
          order: { id: 'desc' },
          select: ['id', 'title', 'createdTime']
        }
      }
    },
    options: { isHaltOnError: true, requestId: 'companies-batch' }
  })

  if (!batch.isSuccess) {
    logger.error('batch failed', batch.getErrorMessages())
    return
  }
  logger.info('batch list:', batch.getData())
}

function teardown() {
  $b24?.destroy()
}
```

Useful getters and services on `B24Frame`:

- `auth`: `getAuthData()`, `refreshAuth()`, `isAdmin`, `getAppSid()`, `getUniq(prefix)`
- `parent`: `fitWindow()`, `resizeWindow(w,h)`, `resizeWindowAuto(node?, minH?, minW?)`, `setTitle(title)`, `closeApplication()`, `reloadWindow()`, `scrollParentWindow(scroll)`
- `slider`: `getUrl(path)`, `openPath(url[, width])`, `openSliderAppPage(params)`, `closeSliderAppPage()`
- `dialog`: `selectUser()`, `selectUsers()` (`selectAccess()` / `selectCRM()` are deprecated)
- `placement`: `title`, `options`, `isSliderMode`, `getInterface()`, `bindEvent(event, cb)`, `call(command, params)`, `callCustomBind(command, params?, cb)`
- `options`: `appGet/appSet`, `userGet/userSet`
- `getLang()`: portal UI language

Patterns:

- Always `await initializeB24Frame()` before any REST call.
- Destroy on page/component unmount with `$b24.destroy()`.
- For large result sets use `b24.actions.v{2,3}.fetchList.make` (async generator, constant memory).
- For batches over 50 commands use `b24.actions.v{2,3}.batchByChunk.make` — the SDK chunks for you.
- A per-command `result` inside a batch can be `null` when the underlying REST method legitimately returns `null` (e.g. `im.chat.get` with non-matching params). Declare the generic as `T | null` and handle the `null` branch — the SDK no longer coerces it to `{}` (see issue #23).
- `restApi:v3` batch is all-or-nothing: per-command errors are not returned. If any call fails, the whole batch fails and `response.getErrorMessages()` carries the error.


## Frontend via UMD (CDN)

When you can't bundle ESM, load the global `B24Js` from a CDN inside your iframe app.

```html
<script src="https://unpkg.com/@bitrix24/b24jssdk@latest/dist/umd/index.min.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const logger = B24Js.LoggerBrowser.build('MyApp', true)
      const $b24 = await B24Js.initializeB24Frame()
      $b24.setLogger(logger)

      const response = await $b24.actions.v2.call.make({
        method: 'crm.item.list',
        params: {
          entityTypeId: B24Js.EnumCrmEntityTypeId.company,
          select: ['id', 'title', 'createdTime']
        },
        requestId: 'umd-companies'
      })

      if (!response.isSuccess) {
        console.error(response.getErrorMessages())
        return
      }
      logger.info('data:', response.getData().result.items)
    } catch (e) {
      console.error(e)
    }
  })
</script>
```

Globals exposed by UMD:

- `B24Js.initializeB24Frame`
- `B24Js.B24Frame` and managers via properties (`auth`, `parent`, `slider`, `dialog`, `placement`, `options`)
- Action types (`B24Js.ApiVersion`, etc.), utilities (`LoggerBrowser`, `Text`, `Type`), enums (e.g. `EnumCrmEntityTypeId`), result classes (`Result`, `AjaxError`, `AjaxResult`)


## Backend / Services (Node.js, ESM) with `B24Hook`

Use `B24Hook` when calling Bitrix24 REST from servers or scripts via incoming webhook. Auth is embedded in the webhook path — **never use this on the client**.

Minimal contract:

- `new B24Hook(b24HookParams, options?)` or `B24Hook.fromWebhookUrl(url, options?)`
- `b24.actions.v{2,3}.{call, callList, fetchList, batch, batchByChunk}.make(options)`

Construct from URL:

```ts
import {
  B24Hook,
  EnumCrmEntityTypeId,
  LoggerBrowser,
  ParamsFactory
} from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Srv', true)

const $b24 = B24Hook.fromWebhookUrl(
  'https://your_domain.bitrix24.com/rest/1/k32t88gf3azpmwv3',
  // Optional: pre-tune limiter for the workload
  // { restrictionParams: ParamsFactory.getBatchProcessing() }
)
$b24.setLogger(logger)
$b24.offClientSideWarning() // server-only — silence the client-warning

// Single call (v2)
const response = await $b24.actions.v2.call.make({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    order: { id: 'desc' }
  },
  requestId: 'companies'
})
logger.info('companies:', response.getData().result.items)

// Batch (array form) — v2 because crm.item.* is v2-only
const batch = await $b24.actions.v2.batch.make({
  calls: [
    ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.company, select: ['id'] }],
    ['crm.item.list', { entityTypeId: EnumCrmEntityTypeId.contact, select: ['id'] }]
  ],
  options: { isHaltOnError: true, requestId: 'cross-list' }
})
logger.info('batch:', batch.getData())
```

Listing helpers:

```ts
// Auto-paged list, in memory — use for known small sets (< 1000)
const list = await $b24.actions.v2.callList.make({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    select: ['id', 'title']
  },
  idKey: 'id',                   // crm.item.list returns lowercase 'id'
  customKeyForResult: 'items',
  requestId: 'deals-list'
})
console.log(list.getData())      // T[]

// Streaming for large datasets — constant memory
for await (const chunk of $b24.actions.v2.fetchList.make({
  method: 'crm.item.list',
  params: { entityTypeId: EnumCrmEntityTypeId.deal },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'deals-stream'
})) {
  console.log('chunk size', chunk.length)
}
```

Notes:

- Supported Node versions: `^18`, `^20`, or `>=22`.
- `B24Hook` warns if used on the client; keep it server-side.
- One `B24Hook` per portal — limiter state is per-instance.


## OAuth local apps with `B24OAuth`

For local apps that authenticate via OAuth. The SDK exposes the same REST surface as `B24Frame` / `B24Hook`; what's different is auth lifecycle (access/refresh tokens, recoverable failures).

```ts
import {
  B24OAuth,
  ParamsFactory,
  RefreshTokenError,
  LoggerBrowser,
  type B24OAuthParams,
  type B24OAuthSecret
} from '@bitrix24/b24jssdk'

// Persisted per-portal/user state — typically captured after the OAuth code exchange.
// Authoritative shapes: packages/jssdk/src/types/auth.ts.
const authOptions: B24OAuthParams = {
  applicationToken: '1xxxxx1694',
  userId: 1,
  memberId: '3xx2030386cyy1b',
  accessToken: '1xxxxx1694',
  refreshToken: '0xxxx4e000011e700000001000000260dc83b47c40e9b5fd501093674c4f5',
  expires: 1745997853,
  expiresIn: 3600,
  scope: 'crm,catalog,bizproc,placement,user_brief',
  domain: 'your_domain.bitrix24.com',
  clientEndpoint: 'https://your_domain.bitrix24.com/rest/',
  serverEndpoint: 'https://oauth.bitrix.info/rest/',
  status: 'L'
}
const oAuthSecret: B24OAuthSecret = {
  clientId: process.env.B24_CLIENT_ID!,
  clientSecret: process.env.B24_CLIENT_SECRET!
}

const $b24 = new B24OAuth(authOptions, oAuthSecret, {
  restrictionParams: ParamsFactory.getDefault()
})

$b24.setLogger(LoggerBrowser.build('OAuthApp', true))
$b24.offClientSideWarning() // server-side

// Persist rotated tokens on every successful refresh
$b24.setCallbackRefreshAuth(async ({ authData, b24OAuthParams }) => {
  await saveTokens(b24OAuthParams)
})

// Optional: produce a new token pair yourself (called instead of the built-in refresh)
$b24.setCustomRefreshAuth(async () => fetchNewTokensFromYourBackend())

try {
  // user.current is v2-only
  const response = await $b24.actions.v2.call.make({ method: 'user.current' })
  console.log(response.getData().result)
} catch (e) {
  if (e instanceof RefreshTokenError) {
    // Refresh token revoked or app uninstalled — redirect user to OAuth consent
    redirectToReauth()
    return
  }
  throw e
}

// Optional — initialise the admin flag once after construction
await $b24.initIsAdmin('init-1')
console.log($b24.auth.isAdmin)
```


## UI integrations in frame (sliders, dialogs, parent window)

These require a `B24Frame` (running inside a Bitrix24 placement iframe).

Sliders:

```ts
const url = $b24.slider.getUrl('/crm/deal/details/1/')
const status = await $b24.slider.openPath(url, 1640)
if (status.isOpenAtNewWindow) {
  // Mobile: opened in a new tab; SDK polled until the tab closed
}

await $b24.slider.openSliderAppPage({ some: 'params' })
await $b24.slider.closeSliderAppPage()
```

Dialogs:

```ts
const user = await $b24.dialog.selectUser()         // null | { id, name, ... }
const users = await $b24.dialog.selectUsers()       // SelectedUser[]
// selectAccess() and selectCRM() exist but are deprecated
```

Parent window and IM integrations:

```ts
await $b24.parent.fitWindow()
await $b24.parent.setTitle('My Page')
await $b24.parent.scrollParentWindow(0)
await $b24.parent.imCallTo(5, true)          // video call to user 5
await $b24.parent.imOpenMessenger('chat12')  // open messenger
```

Placement API:

```ts
console.log($b24.placement.title, $b24.placement.options, $b24.placement.isSliderMode)

const iface = await $b24.placement.getInterface()
await $b24.placement.bindEvent('onMessage', (...args) => console.log(args))
await $b24.placement.call('someCommand', { foo: 'bar' })
await $b24.placement.callCustomBind('someCommand', { opt: 1 }, (...args) => {})
```

Options:

```ts
await $b24.options.appSet('installComplete', true)
const appFlag = $b24.options.appGet('installComplete')

await $b24.options.userSet('theme', 'dark')
const theme = $b24.options.userGet('theme')
```

Auth and environment:

```ts
const auth = $b24.auth.getAuthData()  // { access_token, refresh_token, expires_in, domain, member_id } | false
if (!auth) {
  await $b24.auth.refreshAuth()
}
const lang = $b24.getLang()           // portal UI language
const sid = $b24.getAppSid()          // app SID in current session
```


## Helpers and Pull client

The SDK ships a high-level helper to preload portal/app data and wire the Pull client.

Initialisation (after `B24Frame` is initialised):

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
  LoadDataType.UserOptions
])

// Enable Pull
usePullClient('prefix')                       // optionally pass userId
useSubscribePullClient((m: TypePullMessage) => {
  // handle Pull messages
}, 'application')
startPullClient()

// Access helper data and managers
const helper = getB24Helper()
const userId = helper.profileInfo.data.id
const uniq = $b24.auth.getUniq('prefix')      // unique per member
```

Cleanup order: `destroyB24Helper()` *before* `$b24.destroy()`.

Notes:

- Helper managers: `profile`, `app`, `payment`, `license`, `currency`, `options`.
- `LicenseManager` swaps `RestrictionManager` to enterprise params automatically on enterprise portals (no code change required).
- `CurrencyManager` and the helper-level `OptionsManager` internally use `b24.actions.v{2,3}.batch.make` / `batchByChunk.make`.


## REST calling model

The REST surface lives on `b24.actions` (alongside `b24.tools`):

```text
b24.actions
├── v3 / v2
│   ├── call          .make({ method, params?, requestId? })        → Promise<AjaxResult<T>>
│   ├── callList      .make({ method, params?, idKey?, customKeyForResult, requestId?, limit? })
│   │                                                                → Promise<Result<T[]>>
│   ├── fetchList     .make({ method, params?, idKey?, customKeyForResult, requestId?, limit? })
│   │                                                                → AsyncGenerator<T[]>
│   ├── batch         .make({ calls, options? })                    → Promise<CallBatchResult<T>>
│   └── batchByChunk  .make({ calls, options? })                    → Promise<Result<T[]>>
b24.tools
├── healthCheck       .make({ requestId? })                          → Promise<boolean>
└── ping              .make({ requestId? })                          → Promise<number>  // ms
```

Key option fields:

- `requestId?` — stable id for tracking / dedup / debug logs.
- `idKey?` — id field used for cursor pagination. Default: `'id'` in v3, `'ID'` in v2. For `crm.item.list` always pass `idKey: 'id'`.
- `customKeyForResult` — payload-array key. **Required in v3**, optional in v2 (defaults to `null`, meaning the result array is the response root). For `crm.item.list` it's `'items'`.
- `limit?` (v3 list actions only) — page size. Default `50`, max `1000`.
- `options.isHaltOnError` (batch) — `true` rejects on first failing command; `false` accumulates per-command errors.
- `options.returnAjaxResult` (batch) — wrap each result in `AjaxResult` for granular inspection (incompatible with `batchByChunk`).

Batch input accepts three shapes — pick whichever makes consumer code clearest:

```ts
// 1. Array of tuples
await b24.actions.v3.batch.make({
  calls: [
    ['tasks.task.get', { id: 1, select: ['id', 'title'] }],
    ['tasks.task.get', { id: 2, select: ['id', 'title'] }]
  ]
})

// 2. Array of objects
await b24.actions.v3.batch.make({
  calls: [
    { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
    { method: 'tasks.task.get', params: { id: 2, select: ['id', 'title'] } }
  ]
})

// 3. Named object — results keyed by name
await b24.actions.v3.batch.make({
  calls: {
    Task: { method: 'tasks.task.get', params: { id: 1, select: ['id', 'title'] } },
    Log: ['main.eventlog.list', { select: ['id', 'userId'], pagination: { limit: 5 } }]
  },
  options: { returnAjaxResult: true }
})
```

### Choosing list retrieval strategy

- **`callList.make`** — fetches the entire dataset into memory. Only for small selections (< 1000 items).
- **`fetchList.make`** — streams chunks via async generator. Use for any large/unknown dataset.
- **`call.make` + manual cursor (legacy)** — only when you must control page boundaries yourself, and only in **v2** (v3 has no `next` envelope). See the "Manual pagination" subsection in the deprecation appendix below.

#### A) Small datasets — `callList.make`

```ts
import { EnumCrmEntityTypeId, Text } from '@bitrix24/b24jssdk'

interface Company { id: number, title: string }

const sixMonthAgo = new Date()
sixMonthAgo.setMonth(sixMonthAgo.getMonth() - 6)

const response = await $b24.actions.v2.callList.make<Company>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.company,
    filter: {
      '=%title': 'A%',
      '>=createdTime': Text.toB24Format(sixMonthAgo)
    },
    select: ['id', 'title']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'companies-recent'
})

if (!response.isSuccess) {
  throw new Error(response.getErrorMessages().join('; '))
}

const items: Company[] = response.getData() ?? []
```

#### B) Large datasets — `fetchList.make`

```ts
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

interface Deal { id: number, title: string }

for await (const chunk of $b24.actions.v2.fetchList.make<Deal>({
  method: 'crm.item.list',
  params: {
    entityTypeId: EnumCrmEntityTypeId.deal,
    select: ['id', 'title']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'deals-stream'
})) {
  for (const row of chunk) {
    // process row
  }
}
```

For a v3 method (e.g. `main.eventlog.list`):

```ts
interface LogItem { id: number, userId: number }

const generator = $b24.actions.v3.fetchList.make<LogItem>({
  method: 'main.eventlog.list',
  params: {
    filter: [['timestampX', '>=', Text.toB24Format(sixMonthAgo)]],
    select: ['id', 'userId']
  },
  idKey: 'id',
  customKeyForResult: 'items',
  requestId: 'log-stream',
  limit: 200
})

for await (const chunk of generator) {
  // …
}
```

Notes:

- `callList.make` / `fetchList.make` **ignore** a user-supplied `order` (cursor pagination orders by `idKey`). The action logs a warning. Use `filter` to narrow.
- Errors inside `fetchList.make` throw `SdkError` (code `JSSDK_CORE_B24_FETCH_LIST_METHOD_API_V{2,3}`) on the `for await` iteration.

### Result / AjaxResult basics

```ts
import { AjaxError } from '@bitrix24/b24jssdk'

try {
  // crm.item.* is v2-only
  const res = await $b24.actions.v2.call.make({
    method: 'crm.item.get',
    params: { entityTypeId: 1, id: 10 }
  })
  if (!res.isSuccess) {
    console.error(res.getErrorMessages())
    return
  }
  const payload = res.getData()           // { result: T, time: PayloadTime }
  // res.getTotal() / res.isMore() — @deprecated, v2-only; removed in 2.0.0
} catch (e) {
  if (e instanceof AjaxError) {
    console.error(e.code, e.description, e.status, e.requestInfo)
  } else {
    throw e
  }
}
```


## Rate limiting

The SDK throttles automatically via `RestrictionManager`. Tune only when you have a specific workload need.

```ts
import { ParamsFactory } from '@bitrix24/b24jssdk'

// At construction (B24Hook / B24OAuth)
const $b24 = B24Hook.fromWebhookUrl(url, {
  restrictionParams: ParamsFactory.getBatchProcessing()
})

// Or anytime after init (any entry point)
await $b24.setRestrictionManagerParams(ParamsFactory.getEnterprise())

// Partial override
await $b24.setRestrictionManagerParams({
  ...ParamsFactory.getDefault(),
  rateLimit: { burstLimit: 100, drainRate: 3, adaptiveEnabled: true },
  maxRetries: 5
})
```

Available presets: `getDefault()`, `getEnterprise()`, `getBatchProcessing()`, `getRealtime()`, `fromTariffPlan(plan)`. `LicenseManager` (loaded via `useB24Helper()` + `LoadDataType.App`) auto-applies the enterprise preset on enterprise portals.


## Recommended generation patterns (for AI)

**Frontend:**

- Always guard for frame context; initialise via `await initializeB24Frame()`.
- On component unmount call `$b24.destroy()`.
- For UI actions: prefer `$b24.slider.openPath` and handle mobile fallback via `isOpenAtNewWindow` in the returned `StatusClose`.
- Call `$b24.parent.fitWindow()` after content changes.
- Use `$b24.options.appSet/userSet` for settings persistence.
- All REST calls go through `b24.actions.v{2,3}.*.make`.

**Backend:**

- Construct `B24Hook` with `B24Hook.fromWebhookUrl()` when possible.
- For lists: `callList.make` (small known sets) or `fetchList.make` (large/unknown — preferred).
- For groups of calls: `batch.make` (≤ 50 commands) or `batchByChunk.make` (any size).
- For bulk migrations, pass `ParamsFactory.getBatchProcessing()` as `restrictionParams`.

**OAuth:**

- Always register `setCallbackRefreshAuth` to persist rotated tokens.
- Catch `RefreshTokenError` specifically and redirect to re-auth.
- Don't share a `B24OAuth` instance across users — tokens are user-scoped.

**Logging:**

- Build once via `LoggerBrowser.build(appName, isDev)` and attach via `$b24.setLogger(logger)`.

**Types and enums:**

- Prefer exported enums (e.g. `EnumCrmEntityTypeId`) and types (`ISODate`, payload types).
- For new code prefer v3 methods; fall back to v2 only when v3 doesn't support the method (you'll get `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3`).


## UMD vs ESM cheat sheet

- **UMD:** `window.B24Js` global; load via unpkg CDN; use inside Bitrix24 iframe placements.
- **ESM:** `import from '@bitrix24/b24jssdk'`; works in browsers with bundlers and in Node (server-side) for `B24Hook` / `B24OAuth`.


## Caveats and constraints

- Frame-only APIs (`slider`, `dialog`, `placement`, `parent`, `options`, `auth.refreshAuth`) require Bitrix24 placement context — they don't exist on `B24Hook` / `B24OAuth`.
- `slider.openPath` opens a new tab on mobile and polls for close — check `StatusClose.isOpenAtNewWindow`.
- `B24Hook` is not safe on the client; keep it server-side.
- Batch single-request limit is 50 commands — `batchByChunk.make` splits transparently.


## Export map (selected)

- `initializeB24Frame`, `B24Frame` and its managers: `auth`, `parent`, `slider`, `dialog`, `placement`, `options`
- `B24Hook` (+ `B24Hook.fromWebhookUrl`)
- `B24OAuth` (+ `RefreshTokenError`)
- REST surface on `AbstractB24`: `actions.v{2,3}.{call,callList,fetchList,batch,batchByChunk}`, `tools.{healthCheck,ping}`, `setRestrictionManagerParams`, `getHttpClient`, `destroy`
- Action option types: `ActionCallV{2,3}`, `ActionCallListV{2,3}`, `ActionFetchListV{2,3}`, `ActionBatchV{2,3}`, `ActionBatchByChunkV{2,3}`, `IB24BatchOptions`, `BatchCommandsArrayUniversal`, `BatchCommandsObjectUniversal`, `BatchNamedCommandsUniversal`
- Result/error: `AjaxResult`, `AjaxError`, `Result`, `SdkError`, `RefreshTokenError`
- Limiters: `RestrictionManager`, `RateLimiter`, `OperatingLimiter`, `AdaptiveDelayer`, `ParamsFactory`, `RestrictionParams`
- `LoggerBrowser`, `LoggerFactory`, `Text`, `Type`, `Browser`, `useFormatters`, `pick`, `omit`, `getEnumValue`
- Types/enums: `EnumCrmEntityTypeId`, `ApiVersion`, `ISODate`, `TypeCallParams`, plus modules `types/{http, b24, auth, payloads, user, slider, handler, placement, crm, catalog, bizproc, event, pull, b24-helper}`

Deprecated re-exports (removed in 2.0.0): `AbstractB24.callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`, `chunkArray`; `AjaxResult.isMore`, `hasMore`, `getNext`, `fetchNext`, `getTotal`.


---

This document is based on the SDK source in `packages/jssdk/src` and the docs under `docs/content/docs/`. Use it as the authoritative prompt for generating code with this SDK. For agent-oriented routing (when to load which detailed reference), pair it with [`skills/b24-jssdk/SKILL.md`](../../skills/b24-jssdk/SKILL.md).


## Extras for AI agents (helpers, pull, core, tools)

### Helper methods (high-level data access)

- **`useB24Helper`** — lifecycle for helpers and Pull client in frame apps (see above).
- **`B24HelperManager`** — container for `profile`, `app`, `payment`, `license`, `currency`, `options` managers; exposed via `useB24Helper`.
- **`ProfileManager`** — `helper.profileInfo.data` provides current user info.
- **`AppManager`** — `helper.appInfo.data` and `helper.appInfo.statusCode`.
- **`LicenseManager`** — adjusts `RestrictionManager` for enterprise portals automatically.
- **`CurrencyManager`** — formats amounts for a currency and language:

  ```ts
  const name = helper.currency.getCurrencyFullName('USD', 'en')
  const literal = helper.currency.getCurrencyLiteral('USD', 'en')
  const price = helper.currency.format(1234.56, 'USD', 'en')
  ```

- **`OptionsManager`** (helper level) — bulk save options + optional Pull notification:

  ```ts
  await helper.appOptions.save(
    { featureFlags: helper.appOptions.encode({ a: 1 }) },
    {
      moduleId: 'application',
      command: 'FEATURES_UPDATED',
      params: { source: 'app' }
    }
  )
  const cfg = helper.appOptions.getJsonObject('featureFlags', {})
  ```

### Push and Pull

- Pull client helpers are provided via `useB24Helper`:

  ```ts
  const { usePullClient, useSubscribePullClient, startPullClient } = useB24Helper()
  usePullClient('prefix')
  useSubscribePullClient((m) => { /* handle */ }, 'application')
  startPullClient()
  ```

### Core utilities

- **`AbstractB24`** — shared base: exposes `actions`, `tools`, `setRestrictionManagerParams`, `getHttpClient`, `destroy`.
- **`Http` (v2 + v3)** — low-level transport; supports restriction throttling and auth refresh. Not normally used directly.
- **`RestrictionManager`** — automatic throttling to respect Bitrix24 limits:

  ```ts
  import { ParamsFactory } from '@bitrix24/b24jssdk'
  // Done automatically by LicenseManager when useB24Helper is in scope:
  await $b24.setRestrictionManagerParams(ParamsFactory.getEnterprise())
  ```

- **Unique ID generator** — request IDs are appended automatically via `Http`. Pass an explicit `requestId` in `make(options)` for stable correlation in logs.
- **`Result` / `AjaxResult`** — uniform result objects, error aggregation. Legacy paging helpers `isMore` / `getNext` / `getTotal` are `@deprecated` for `2.0.0` — see Deprecation notice.
- **Language list** and **`LoggerBrowser`** — i18n + logging.

### Tools (utilities)

- **`Type`** — runtime type helpers (`isStringFilled`, `isPlainObject`, …).
- **`Text`** — dates (Luxon), numbers (`numberFormat`), UUID v7, encode/decode, case transforms:

  ```ts
  import { Text } from '@bitrix24/b24jssdk'
  const dt = Text.toDateTime('2024-01-01T10:00:00Z')
  const s = Text.numberFormat(12345.678, 2, '.', ' ')
  const id = Text.getUuidRfc4122()
  ```

- **`Browser`** — lightweight browser utilities.
- **`useFormatters`** — number/date formatting hooks.
- **`pick` / `omit` / `getEnumValue`** — object and enum helpers.
