---
name: b24jssdk-core
description: Pick and initialize the right b24jssdk entry point (B24Hook for backends, B24Frame for in-iframe apps, B24OAuth for OAuth-installed apps), wire up logging, and handle errors uniformly. Load first when generating any b24jssdk code.
---

# b24jssdk core

Three entry points share the same REST surface (`callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk`). Pick by **where the code runs**:

| Entry point | Where | Auth source |
|---|---|---|
| `B24Hook` | Node.js / scripts / serverless | inbound webhook URL (`/rest/<userId>/<secret>`) |
| `B24Frame` | Browser, **inside** a Bitrix24 placement iframe | `postMessage` handshake with the parent window |
| `B24OAuth` | Server side of an OAuth-installed Bitrix24 app | `accessToken` + `refreshToken` from Bitrix24 install events |

> Once initialized, write the rest of your code against the abstract type `TypeB24` so the same logic runs on any of the three. All examples in this skill set the variable as `$b24`.

## B24Hook (backend / scripts)

```ts
import { B24Hook, LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('Srv', process.env.NODE_ENV !== 'production')

const $b24 = B24Hook.fromWebhookUrl(
  // Format: https://<portal>.bitrix24.<tld>/rest/<userId>/<secret>
  process.env.B24_HOOK!
)

// B24Hook holds a secret — silence the "you're using a webhook in the browser" warning
// only on the server. Never disable it in browser code.
$b24.offClientSideWarning?.()

const me = await $b24.callMethod('profile')
logger.info('Hello,', me.getData().result.NAME)
```

Alternative constructor (manual):

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

Wire `boot` to your app entry point and `teardown` to component/page unmount. `initializeB24Frame()` deduplicates concurrent calls — safe to await it from multiple places.

## B24OAuth (server side of an OAuth app)

```ts
import { B24OAuth } from '@bitrix24/b24jssdk'

// `b24OAuthParams` come from the install/refresh events of your Bitrix24 app
// (applicationToken, accessToken, refreshToken, expires, expiresIn, domain, ...)
// `oAuthSecret` is your registered app's clientId/clientSecret pair.
const $b24 = new B24OAuth(b24OAuthParams, { clientId, clientSecret })

// Persist refreshed credentials so the next process gets the latest tokens
$b24.setCallbackRefreshAuth(async ({ authData, b24OAuthParams }) => {
  await db.appCredentials.upsert(b24OAuthParams)
})

// Optional: silence the client-side warning on the server
$b24.offClientSideWarning()

await $b24.initIsAdmin() // populates auth.isAdmin
```

`B24OAuth` automatically refreshes the access token on 401. Always register `setCallbackRefreshAuth` on the server so refreshed tokens are persisted.

## Logging

```ts
import { LoggerBrowser } from '@bitrix24/b24jssdk'

const logger = LoggerBrowser.build('AppName', /* isDev */ true)
logger.info('starting up')
logger.warn('something looks off')
logger.error('failure', new Error('boom'))
```

`isDev` toggles verbose output. `AbstractB24` defaults to a null logger; pass yours via `setLogger` if you want SDK-internal traces:

```ts
$b24.setLogger?.(logger)
```

## Error handling

`callMethod` returns an `AjaxResult`; failures throw `AjaxError`. `callBatch` returns a `Result` that aggregates errors when `isHaltOnError = false`.

```ts
import { AjaxError } from '@bitrix24/b24jssdk'

try {
  const res = await $b24.callMethod('crm.deal.get', { id: 10 })
  if (!res.isSuccess) {
    // Non-throw failure path (rare; usually you'll see throws)
    logger.warn('non-success result', res.getErrors().map((e) => e.message))
    return
  }
  return res.getData().result
} catch (e) {
  if (e instanceof AjaxError) {
    logger.error('REST error', { code: e.code, status: e.status, info: e.requestInfo })
    return
  }
  throw e
}
```

Common AjaxError codes worth handling:
- `ERROR_NOT_FOUND` — id does not exist (404)
- `INVALID_CREDENTIALS` / `EXPIRED_TOKEN` — let `B24Frame` / `B24OAuth` refresh; for `B24Hook`, the webhook is wrong
- `QUERY_LIMIT_EXCEEDED` — you hit the rate limit; the SDK already throttles via `RateLimiter`, but you may need `callBatchByChunk` instead of a tight loop
- `INTERNAL_SERVER_ERROR` (50x) — retry with exponential backoff

## Picking method names

| Need | Method |
|---|---|
| CRM v3 (deals, contacts, companies, leads, smart processes) | `crm.item.list` / `crm.item.get` / `crm.item.add` / `crm.item.update` / `crm.item.delete` with `entityTypeId` from `EnumCrmEntityTypeId` |
| CRM v1 / classic | `crm.deal.*`, `crm.contact.*`, `crm.company.*`, `crm.lead.*` (uppercase fields) |
| Tasks | `tasks.task.add/get/list/update/delete` |
| Disk | `disk.storage.getlist`, `disk.folder.getchildren`, `disk.folder.addsubfolder`, `disk.file.get` |
| User | `user.get`, `user.current` |
| Profile (current user) | `profile` |
| IM | `im.message.add`, `im.notify` |

> Prefer `crm.item.*` (v3) for new code — the field names are camelCase (`stageId`, `assignedById`, `createdTime`) and pagination uses `customKey: 'items'`. The classic `crm.deal.list` returns uppercase fields (`STAGE_ID`, `ASSIGNED_BY_ID`).

## When you don't know which entry point you're in

Write functions against `TypeB24`:

```ts
import type { TypeB24 } from '@bitrix24/b24jssdk'

export async function loadDeal($b24: TypeB24, id: number) {
  const res = await $b24.callMethod('crm.deal.get', { id })
  return res.getData().result
}
```

Same `loadDeal` works with `B24Hook`, `B24Frame`, and `B24OAuth`.
