# OAuth apps

For local apps that authenticate via OAuth — the SDK manages access/refresh tokens and exposes the same REST surface as the other entry points. Use this when the app needs to operate across portals or sessions where a webhook isn't appropriate.

For the full OAuth dance (redirect, code exchange) follow Bitrix24's [OAuth documentation](https://apidocs.bitrix24.com/api-reference/oauth/index.html). The SDK takes over once you have the token pair.

## Construction

`B24OAuth` is exported from `@bitrix24/b24jssdk` and is constructed with the access/refresh tokens and the portal endpoint. Inspect the type via [`api-surface`](../api-surface.md) or the source under `packages/jssdk/src/oauth/`.

```ts
import { B24OAuth, LoggerBrowser } from '@bitrix24/b24jssdk'

const $b24 = new B24OAuth(/* access token, refresh token, endpoint */)
$b24.setLogger(LoggerBrowser.build('OAuthApp', true))
```

## REST calls — same as everywhere

```ts
const res = await $b24.callMethod('user.current')
console.log(res.getData().result)
```

`callMethod`, `callBatch`, `callListMethod`, `fetchListMethod`, `callBatchByChunk` work identically to `B24Frame` and `B24Hook`. See [batch-calls](batch-calls.md) and [list-pagination](list-pagination.md).

## Refresh-token failures

When the refresh token is invalid or expired, `B24OAuth` raises a typed error. Catch it specifically and trigger your re-auth flow — don't catch generically:

```ts
try {
  const res = await $b24.callMethod('user.current')
} catch (e) {
  // Inspect e — if it's the refresh-token error, redirect to OAuth consent
  // For other errors (AjaxError), follow normal error handling
  throw e
}
```

For details on error shapes and recommended branching, see [error-handling](../guidelines/error-handling.md).

## Storing tokens

The SDK does not persist tokens for you. Persist them in your app's database / session store and reconstruct `B24OAuth` from the stored values on each request (or keep an instance alive in a long-running process).

## Anti-patterns

- Re-using a single `B24OAuth` across users in a multi-tenant server — tokens are user-scoped.
- Logging access tokens (even at `debug`). Treat them like passwords.
- Catching the refresh-token error generically and retrying — the user must re-auth; retrying just spins.
