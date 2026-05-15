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

const authOptions: B24OAuthParams = {
  domain: 'your_domain.bitrix24.com',
  // … remaining auth params (memberId, accessToken, refreshToken, expiresIn, …)
  // see types/auth.ts for the full shape
}

const oAuthSecret: B24OAuthSecret = {
  // client_id / client_secret + token-refresh endpoint config
  // see types/auth.ts for the full shape
}

const $b24 = new B24OAuth(authOptions, oAuthSecret, {
  restrictionParams: ParamsFactory.getDefault()
})

$b24.setLogger(LoggerBrowser.build('OAuthApp', true))
$b24.offClientSideWarning() // server-side only — silence the browser warning
```

The third argument is optional and accepts `restrictionParams` (partial) for the limiter stack. See [rate-limiting](../guidelines/rate-limiting.md). For the exact `B24OAuthParams` / `B24OAuthSecret` field lists, read [`packages/jssdk/src/types/auth.ts`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts) — those types are the contract.

## REST calls — same as everywhere

```ts
const response = await $b24.actions.v3.call.make({
  method: 'user.current'
})

console.log(response.getData().result)
```

`$b24.actions.v{2,3}.{call,callList,fetchList,batch,batchByChunk}.make(options)` work identically to `B24Frame` and `B24Hook`. See [batch-calls](batch-calls.md) and [list-pagination](list-pagination.md).

## Refresh-token lifecycle

`B24OAuth` will use the refresh token automatically when the access token expires. Two callbacks let you plug into the cycle:

```ts
$b24.setCallbackRefreshAuth((newAuth) => {
  // Called after a successful refresh — persist the new tokens
  // so a restart doesn't lose them.
  saveTokens(newAuth)
})

$b24.setCustomRefreshAuth(async (currentAuth) => {
  // Optional: override how a new token is obtained.
  // Useful when refresh lives in a separate service / database.
  return fetchNewTokensFromYourBackend(currentAuth)
})

// Tear down later if needed
$b24.removeCallbackRefreshAuth()
$b24.removeCustomRefreshAuth()
```

When the refresh itself fails (token revoked, app uninstalled), `B24OAuth` throws a typed `RefreshTokenError`. Catch it specifically and trigger your re-auth flow — don't catch it generically:

```ts
import { RefreshTokenError } from '@bitrix24/b24jssdk'

try {
  await $b24.actions.v3.call.make({ method: 'user.current' })
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
