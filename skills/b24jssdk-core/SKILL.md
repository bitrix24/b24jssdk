---
name: b24jssdk-core
description: Pick and initialize the right b24jssdk entry point (B24Hook for backends, B24Frame for in-iframe apps, B24OAuth for OAuth-installed apps), wire up logging, handle errors, and tune restriction-manager retry behaviour (hardErrorCodes, softErrorCodes, retryOnNetworkError). Load first when generating any b24jssdk code.
---

# b24jssdk core

Three entry points share the same REST surface, exposed via `$b24.actions.v{2,3}.*`. Pick by **where the code runs**:

| Entry point | Where | Auth source |
| --- | --- | --- |
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
$b24.offClientSideWarning()

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
- `INVALID_CREDENTIALS` / `EXPIRED_TOKEN` (401) — the SDK auto-refreshes the token and retries once on every entry point; for `B24Hook` the refresh is a no-op, so a wrong webhook still fails
- `QUERY_LIMIT_EXCEEDED` — rate limit. The SDK already throttles, but you may need `batchByChunk` instead of a tight loop.
- `INTERNAL_SERVER_ERROR` (50x) — transient. The SDK retries automatically up to `maxRetries`.

Common SdkError codes:

- `JSSDK_CORE_METHOD_NOT_SUPPORT_IN_API_V3` — thrown only by the deprecated `AjaxResult.getNext()` against a v3 client. `actions.v3.*.make` no longer throws it: the SDK dropped its v3 method allowlist, so an unknown v3 method comes back as a `METHODNOTFOUNDEXCEPTION` soft error on the result instead.

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

> **Scope:** `setRestrictionManagerParams` updates the policy on the **`$b24` instance**, not on the call you're about to make. Every concurrent or subsequent call on the same `$b24` sees the new params until you set them again. In code paths that mix idempotent reads with non-idempotent writes on the same `$b24`, use a dedicated `$b24` instance for the non-idempotent flow (or a per-method idempotency token + manual reconciliation) instead of flipping the policy in-flight.

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

## Security checklist for event-receiver recipes

When the code RECEIVES events from Bitrix24 (outbound webhook handlers, OAuth install / uninstall endpoints), apply this checklist — both anti-spoof and anti-retry-storm. Concrete worked examples live in recipes `07-webhook-handler.ts` and `12-oauth-install.ts`.

- [ ] **Respond `200` first, verify after.** Bitrix24 retries any non-2xx response for up to 24 h. Send `res.status(200).send('ok')` immediately on payload receipt, then do the verification + business logic asynchronously. Failures in those async steps log + drop, not retry-cascade.
- [ ] **Verify `application_token` for outbound webhooks.** Compare `payload.auth?.application_token` against the value from your Bitrix24 dev console (typically supplied via env var). On mismatch — log and ignore. Without this, any caller that knows the URL can replay arbitrary events.
- [ ] **Verify `application_token` against persisted credentials on uninstall.** On `ONAPPUNINSTALL`, look up the stored creds for the incoming `member_id`, compare `application_token`, and only delete on match. Without this, anyone who reaches `/uninstall` can erase credentials for any portal whose `member_id` they guess.
- [ ] **Persist refreshed OAuth tokens.** Always call `setCallbackRefreshAuth` on every `B24OAuth` instance to write fresh tokens back to your store. The next cold start expects them.
- [ ] **Keep `B24Hook` server-side.** It bundles a long-lived secret. `offClientSideWarning()` silences the warning only on Node; the SDK refuses to silence it in the browser entry points.
- [ ] **HTML-escape user input before posting to chat / IM.** When sending CRM text through `parse_mode: 'HTML'` (Telegram) or `im.message.add` HTML, escape `<` / `>` / `&` in the payload.

## Picking method names

| Need | Method | API version |
| --- | --- | --- |
| CRM entities (deals, contacts, companies, leads, smart processes) | `crm.item.{list,get,add,update,delete}` with `entityTypeId` from `EnumCrmEntityTypeId` | v2 |
| Tasks read/write/list | `tasks.task.{add,get,update,delete,list}` | **v3** |
| Tasks extras | `tasks.task.checklistitem.*`, … | v2 |
| Disk | `disk.storage.getlist`, `disk.folder.{getchildren,addsubfolder}`, `disk.file.get` | v2 |
| Profile / users | `profile`, `user.get`, `user.current` | v2 |
| IM | `im.notify`, `im.message.add` | v2 |
| Event log | `main.eventlog.{list,get,tail}` | **v3** |
| Mail | `mail.mailbox.*`, `mail.message.*`, `mail.recipient.*` | **v3** |
| Org structure (HR) | `humanresources.node.*`, `humanresources.employee.*` | **v3** |
| Time tracking | `timeman.record.*` (read-only) | **v3** |

> The version column is a recommendation, not a gate: the SDK no longer keeps a v3 allowlist, so `actions.v3.*` will send any method to the v3 endpoint (the server validates it) and `actions.v2.*` no longer warns about v3-eligible methods. Pick the version that gives you the representation you want.

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
