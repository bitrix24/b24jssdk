---
outline: deep
---
# `AuthManager` Class {#AuthManager}

Designed for managing authentication in Bitrix24 applications. It handles authentication data received from the parent window and provides methods for updating and retrieving this data.

```ts
// ... /////
$b24 = await initializeB24Frame()
if($b24.auth.isAdmin)
{
	// ... ////
}
```

::: tip
You can test working with **B24Frame.auth** in this [example](https://github.com/bitrix24/b24sdk-examples/blob/main/js/03-nuxt-frame/pages/index.client.vue).
:::

## Getters {#getters}
### `isAdmin` {#isAdmin}
```ts
get isAdmin(): boolean
```

Returns `true` if the current user has admin rights, otherwise `false`. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/additional-functions/bx24-is-admin.html)

## Methods {#methods}

::: info
Implements the [`AuthActions`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts) interface.
:::

### `getAuthData` {#getAuthData}
```ts
getAuthData(): false|AuthData
```

Returns authentication data ([`AuthData`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts)) if it has not expired. If expired, returns `false`. [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-get-auth.html)

### `refreshAuth` {#refreshAuth}
```ts
async refreshAuth(): Promise<AuthData>
```

Refreshes authentication data through the parent window and returns the updated data ([`AuthData`](https://github.com/bitrix24/b24jssdk/blob/main/packages/jssdk/src/types/auth.ts)). [Similar to function](https://apidocs.bitrix24.com/api-reference/bx24-js-sdk/system-functions/bx24-refresh-auth.html)

### `getUniq` {#getUniq}
```ts
getUniq(prefix: string): string
```

Returns a unique string consisting of the given prefix and `AuthData.memberId`.

> Used in ['B24PullClientManager'](pull-client)