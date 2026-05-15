# OAuth apps

For local apps that authenticate via OAuth — the SDK manages access/refresh tokens and exposes the same REST surface as the other entry points. Use this when the app needs to operate across portals or sessions where a webhook isn't appropriate.

For the full OAuth dance (redirect, code exchange) follow Bitrix24's [OAuth documentation](https://apidocs.bitrix24.com/api-reference/oauth/index.html). The SDK takes over once you have the token pair.

## Construct

```ts
import {
  B24OAuth,
  ParamsFactory,
  LoggerBrowser,
  type B24OAuthParams,
  type B24OAuthSecret
} from '@bitrix24/b24jssdk'

// Persisted per-portal/user state — typically stored after the OAuth code exchange
const authOptions: B24OAuthParams = {
  applicationToken: '1xxxxx1694',
  userId: 1,
  memberId: '3xx2030386cyy1b',
  accessToken: '1xxxxx1694',
  refreshToken: '0xxxx4e000011e700000001000000260dc83b47c40e9b5fd501093674c4f5',
  expires: 1745997853,           // epoch seconds
  expiresIn: 3600,
  scope: 'crm,catalog,bizproc,placement,user_brief',
  domain: 'your_domain.bitrix24.com',
  clientEndpoint: 'https://your_domain.bitrix24.com/rest/',
  serverEndpoint: 'https://oauth.bitrix.info/rest/',
  status: 'L'
}

// App credentials from the Bitrix24 marketplace listing — never embed in client code
const oAuthSecret: B24OAuthSecret = {
  clientId: process.env.B24_CLIENT_ID!,
  clientSecret: process.env.B24_CLIENT_SECRET!
}

const $b24 = new B24OAuth(authOptions, oAuthSecret, {
  restrictionParams: ParamsFactory.getDefault()
})

$b24.setLogger(LoggerBrowser.build('OAuthApp', true))
$b24.offClientSideWarning() // server-side only — silence the browser warning
```

The third argument is optional and accepts a partial `restrictionParams` for the limiter stack — see [rate-limiting](../guidelines/rate-limiting.md). The authoritative shapes are in [`packages/jssdk/src/types/auth.ts`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts).

## REST calls — same as everywhere

```ts
const response = await $b24.actions.v2.call.make({
  method: 'user.current'
})

console.log(response.getData().result)
```

`$b24.actions.v{2,3}.{call,callList,fetchList,batch,batchByChunk}.make(options)` work identically to `B24Frame` and `B24Hook`. See [rest-api-v2](rest-api-v2.md) and [rest-api-v3](rest-api-v3.md). Most methods are v2-only today — `user.current` and `profile` included; only `tasks.task.*` / `main.eventlog.*` and meta endpoints are on v3 so far.

## Refresh-token lifecycle

`B24OAuth` will use the refresh token automatically when the access token expires. Two callbacks let you plug into the cycle:

```ts
// Notification: a refresh just succeeded and the SDK now holds fresh tokens.
// Persist them so a restart picks up where this process left off.
$b24.setCallbackRefreshAuth(async ({ authData, b24OAuthParams }) => {
  await saveTokens(b24OAuthParams) // { applicationToken, accessToken, refreshToken, expires, ... }
})

// Override: produce a new token pair yourself, e.g. by calling a central
// token-refresh service. Called instead of the SDK's built-in refresh.
$b24.setCustomRefreshAuth(async () => {
  return fetchNewTokensFromYourBackend()
  // -> { access_token, refresh_token, expires, expires_in, client_endpoint,
  //      server_endpoint, member_id, scope, status, domain }
})

// Tear down later if needed
$b24.removeCallbackRefreshAuth()
$b24.removeCustomRefreshAuth()
```

Signatures (from `types/auth.ts`):

```ts
type CallbackRefreshAuth = (params: { authData: AuthData, b24OAuthParams: B24OAuthParams }) => Promise<void>
type CustomRefreshAuth = () => Promise<HandlerRefreshAuth>
```

When the refresh itself fails (token revoked, app uninstalled), `B24OAuth` throws a typed `RefreshTokenError`. Catch it specifically and trigger your re-auth flow — don't catch it generically:

```ts
import { RefreshTokenError } from '@bitrix24/b24jssdk'

try {
  await $b24.actions.v2.call.make({ method: 'user.current' })
} catch (e) {
  if (e instanceof RefreshTokenError) {
    // Token revoked or app uninstalled — redirect user to OAuth consent
    redirectToReauth()
    return
  }
  throw e
}
```

## `initIsAdmin`

Optional — call once after construction if you need `$b24.auth.isAdmin`:

```ts
await $b24.initIsAdmin('init-1')
console.log($b24.auth.isAdmin)
```

It calls the `profile` REST method internally and caches the admin flag on the auth manager.

## Storing tokens

The SDK does not persist tokens for you. Store them in your app's database / session store. On each request (or worker startup) construct a `B24OAuth` from the stored values; on every successful refresh, your `setCallbackRefreshAuth` handler should write the new tokens back.

## Anti-patterns

- Re-using a single `B24OAuth` across users in a multi-tenant server — tokens are user-scoped.
- Logging access/refresh tokens (even at `debug`). Treat them like passwords.
- Catching `RefreshTokenError` generically and retrying — the user must re-auth; retrying just spins.
- Skipping `setCallbackRefreshAuth` — tokens silently rotate and your stored copy goes stale.
