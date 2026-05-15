---
name: b24jssdk-core
description: Pick and initialize the right b24jssdk entry point (B24Hook for backends, B24Frame for in-iframe apps, B24OAuth for OAuth-installed apps), wire up logging, handle errors, and tune restriction-manager retry behaviour (hardErrorCodes, softErrorCodes, retryOnNetworkError). Load first when generating any b24jssdk code.
---

# b24jssdk core

Three entry points share the same REST surface, exposed via `$b24.actions.v{2,3}.*`. Pick by **where the code runs**:

| Entry point | Where | Auth source |
|---|---|---|
| `B24Hook` | Node.js / scripts / serverless | inbound webhook URL (`/rest/<userId>/<secret>`) |
| `B24Frame` | Browser, **inside** a Bitrix24 placement iframe | `postMessage` handshake with the parent window |
| `B24OAuth` | Server side of an OAuth-installed Bitrix24 app | `accessToken` + `refreshToken` from Bitrix24 install events |

> Once initialized, write the rest of your code against the abstract type `TypeB24` so the same logic runs on any of the three.

## B24Hook (backend / scripts)

```ts
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Srv', process.env.NODE_ENV !== 'production')

const $b24 = B24Hook.fromWebhookUrl(
  // Format: https://<portal>.bitrix24.<tld>/rest/<userId>/<secret>
  process.env.B24_HOOK!
)

// Server-side only — silence the warning that B24Hook leaks the secret in browser bundles.
$b24.offClientSideWarning?.()

const me = await $b24.actions.v2.call.make<{ NAME: string; ID: number }>({
  method: 'profile',
  requestId: 'profile-1'
})
logger.info('Hello,', me.getData()!.result.NAME)
```

Alternative constructor (manual parts):

```ts
const $b24 = new B24Hook({
  b24Url: 'https://your_domain.bitrix24.com',
  userId: 1,
  secret: 'k32t88gf3azpmwv3'
})
```

Notes:
- Keep `B24Hook` server-side only. The webhook URL contains a long-lived secret.
- Supported Node: `^18`, `^20`, `>=22`.

## B24Frame (in-iframe app)

```ts
import { initializeB24Frame, LoggerBrowser, type B24Frame } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('App', import.meta.env?.DEV === true)
let $b24: B24Frame

async function boot() {
  $b24 = await initializeB24Frame()
  // The frame handles auth transparently; refresh on 401 is automatic.
}

function teardown() {
  $b24?.destroy()
}
```

`initializeB24Frame()` deduplicates concurrent calls — safe to await it from multiple places.

## B24OAuth (server side of an OAuth app)

```ts
import { B24OAuth } from '@bitrix24/b24jssdk'

// `b24OAuthParams` come from the install/refresh events of your Bitrix24 app
// (applicationToken, accessToken, refreshToken, expires, expiresIn, domain, …)
// `oAuthSecret` is your registered app's clientId/clientSecret pair.
const $b24 = new B24OAuth(b24OAuthParams, { clientId, clientSecret })

// Persist refreshed credentials so the next process gets the latest tokens
$b24.setCallbackRefreshAuth(async ({ authData, b24OAuthParams }) => {
  await db.appCredentials.upsert(b24OAuthParams)
})

$b24.offClientSideWarning()

await $b24.initIsAdmin() // populates auth.isAdmin
```

`B24OAuth` automatically refreshes the access token on 401. **Always register `setCallbackRefreshAuth` on the server** so refreshed tokens are persisted.

## Logging

```ts
import { LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('AppName', /* isDev */ true)
logger.info('starting up')
logger.warn('something looks off')
logger.error('failure', new Error('boom'))
```

`isDev` toggles verbose output. To get SDK-internal traces:

```ts
$b24.setLogger?.(logger)
```

## Error handling

`actions.v{2,3}.call.make` returns an `AjaxResult`. REST-level failures throw `AjaxError`. SDK-level failures (wrong API version for a method, etc.) throw `SdkError`.

```ts
import { AjaxError, SdkError } from '@bitrix24/b24jssdk'

try {
  const res = await $b24.actions.v2.call.make<{ item: Deal }>({
    method: 'crm.item.get',
    params: { entityTypeId: 2, id: 999_999 }
  })
  if (!res.isSuccess) {
    // Soft errors only (see softErrorCodes below). Most failures throw.
    logger.warn('non-success result', res.getErrorMessages())
    return
  }
  return res.getData()!.result.item
} catch (e) {
  if (e instanceof AjaxError) {
    logger.error('REST error', { code: e.code, status: e.status, message: e.message, requestInfo: e.requestInfo })
  } else if (e instanceof SdkError) {
    logger.error('SDK error', { code: e.code, message: e.message })
  } else {
    throw e
  }
}
```

Common AjaxError codes worth handling:
- `ERROR_NOT_FOUND` — id does not exist (404)
- `INVALID_CREDENTIALS` / `EXPIRED_TOKEN` — let `B24Frame` / `B24OAuth` refresh; for `B24Hook`, the webhook is wrong
- `QUERY_LIMIT_EXCEEDED` — rate limit. The SDK already throttles, but you may need `batchByChunk` instead of a tight loop.
- `INTERNAL_SERVER_ERROR` (50x) — transient. The SDK retries automatically up to `maxRetries`.

Common SdkError codes:
- `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` — you called `actions.v3.*.make` with a method that isn't in the v3 whitelist.
- `JSSDK_VERSION_MANAGER_NOT_DETECT_FOR_METHOD` — auto-detection failed (typically means the method doesn't exist).

## Tuning retry / throw behaviour

The restriction manager classifies errors into **hard** (throw immediately, no retry) and **soft** (return inside `AjaxResult` for inspection). Defaults cover the well-known Bitrix24 codes; extend per-app via `RestrictionParams`.

```ts
import { B24Hook, ParamsFactory, ApiVersion } from '@bitrix24/b24jssdk'

const $b24 = B24Hook.fromWebhookUrl(process.env.B24_HOOK!)

await $b24.setRestrictionManagerParams({
  ...ParamsFactory.getDefault(),

  // Codes that must throw immediately (no retry). Use for business-specific
  // error codes that the SDK doesn't know about — otherwise the SDK treats
  // unknown codes as transient and retries with backoff.
  hardErrorCodes: [
    'DOCUMENT_GENERATOR_ALREADY_IN_QUEUE',
    'MY_APP_BAD_PAYLOAD'
  ],

  // Codes that should be returned in AjaxResult as soft errors instead of
  // thrown — useful when you want control-flow on a specific REST error.
  softErrorCodes: [
    'CUSTOM_VALIDATION_ERROR'
  ],

  // For NON-IDEMPOTENT methods (any *.add, file uploads) — set to false so the
  // SDK does NOT retry on NETWORK_ERROR / REQUEST_TIMEOUT. A client-side
  // timeout doesn't mean the server didn't process the call; retrying creates
  // duplicates.
  retryOnNetworkError: false,

  maxRetries: 3,
  retryDelay: 1_000
})
```

`hardErrorCodes` and `softErrorCodes` are **additive** — the built-in lists (auth/fatal codes) are always hard, and you can't remove them, only extend (per `packages/jssdk/src/types/limiters.ts:120-146`).

For heavy long-running calls, also raise the axios timeout on the underlying HTTP client:

```ts
const clientAxios = $b24.getHttpClient(ApiVersion.v2).ajaxClient
clientAxios.defaults.timeout = 120_000
```

## Enterprise limits

`LicenseManager` (from `useB24Helper`) automatically swaps in the enterprise restriction params if the portal is enterprise. To do it manually:

```ts
import { ParamsFactory } from '@bitrix24/b24jssdk'

await $b24.setRestrictionManagerParams(ParamsFactory.getEnterprise())
```

## Picking method names

| Need | Method | API version |
|---|---|---|
| CRM entities (deals, contacts, companies, leads, smart processes) | `crm.item.{list,get,add,update,delete}` with `entityTypeId` from `EnumCrmEntityTypeId` | v2 |
| Tasks read/write | `tasks.task.{add,get,update,delete}` | **v3** |
| Tasks listing / extras | `tasks.task.list`, `tasks.task.checklistitem.*`, … | v2 |
| Disk | `disk.storage.getlist`, `disk.folder.{getchildren,addsubfolder}`, `disk.file.get` | v2 |
| Profile / users | `profile`, `user.get`, `user.current` | v2 |
| IM | `im.notify`, `im.message.add` | v2 |
| Event log | `main.eventlog.{list,get,tail}` | **v3** |

> Calling a v3-eligible method through `actions.v2.*` works but logs a warning (`JSSDK_CORE_METHOD_AVAILABLE_IN_API_V3`). Move it to v3 when convenient.

## When you don't know which entry point you're in

Write functions against `TypeB24`:

```ts
import type { TypeB24 } from '@bitrix24/b24jssdk'
import { EnumCrmEntityTypeId } from '@bitrix24/b24jssdk'

interface Deal { id: number; title: string }

export async function loadDeal($b24: TypeB24, id: number): Promise<Deal> {
  const res = await $b24.actions.v2.call.make<{ item: Deal }>({
    method: 'crm.item.get',
    params: { entityTypeId: EnumCrmEntityTypeId.deal, id }
  })
  if (!res.isSuccess) throw new Error(res.getErrorMessages().join('; '))
  return res.getData()!.result.item
}
```

Same `loadDeal` works unchanged with `B24Hook`, `B24Frame`, and `B24OAuth`.
